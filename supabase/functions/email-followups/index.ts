// email-followups — denní cron (pg_cron/pg_net), týdenní follow-up e-maily.
//   Trasa A: nekoupili (popup s kódem, Preview, registrace bez nákupu) — den 3, 10, 17
//   Trasa B: koupili a spálili účet — den 3, 10, 17 po uzavření, vždy se speciálním resetem
// Pravidla: max. 3 e-maily na člověka a trasu, nikdy dřív než 6 dní po předchozím,
// nikdy po odhlášení, nikdy poté, co člověk koupil (A) / resetoval nebo znovu koupil (B).
// Časová osa začíná nejdřív ve FEATURE_START, ať se po spuštění neodešle celý
// historický seznam najednou; denní strop MAX_PER_RUN rozloží odesílání.
//
// POST, hlavička x-cron-secret (CRON_SECRET). Tělo (vše volitelné):
//   { dry_run: true }                      → jen vypíše, komu by co odešlo
//   { test_to: "a@b.cz", track: "A", step: 1, lang: "pl", package_key: "starter" }
//                                          → pošle jeden testovací e-mail sem
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { renderFollowup, type Lang, type Track } from "../_shared/followup-emails.ts";
import { unsubscribeUrl } from "../_shared/unsubscribe.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://fundly.games";
const FEATURE_START = new Date(Deno.env.get("FOLLOWUP_START") ?? "2026-09-26T00:00:00Z").getTime();
const STEP_DAYS = [3, 10, 17];
const MIN_GAP_MS = 6 * 86400000;
const MAX_PER_RUN = Number(Deno.env.get("FOLLOWUP_MAX_PER_RUN") ?? "150");
const DAY = 86400000;

function langFor(email: string, hint?: string | null): Lang {
  if (hint === "pl") return "pl";
  return email.toLowerCase().endsWith(".pl") ? "pl" : "en";
}

interface Candidate {
  email: string;
  track: Track;
  startAt: number; // začátek časové osy
  lang: Lang;
  packageKey?: string;
  closedAt?: string | null;
  reason?: string | null;
}

// deno-lint-ignore no-explicit-any
async function allAuthUsers(supabase: any): Promise<any[]> {
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users ?? [];
    out.push(...users);
    if (users.length < 1000) break;
  }
  return out;
}

serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  if (!expected || (req.headers.get("x-cron-secret") ?? "") !== expected) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;

    // ---------- testovací odeslání ----------
    if (body.test_to) {
      const to = String(body.test_to);
      const track = (body.track === "B" ? "B" : "A") as Track;
      const step = Math.min(3, Math.max(1, Number(body.step) || 1));
      const lang = (body.lang === "pl" ? "pl" : "en") as Lang;
      const { subject, html } = renderFollowup(track, step, {
        lang, siteUrl: SITE_URL, unsubscribeUrl: await unsubscribeUrl(SITE_URL, to),
        packageKey: String(body.package_key ?? "starter"),
        closedAt: new Date(Date.now() - 3 * DAY).toISOString(),
        reason: "Max. daily loss exceeded (-4 %)",
      });
      const r = await sendEmail({ to, subject: `[TEST ${track}${step}] ${subject}`, html });
      return jsonResponse({ ok: r.sent, error: r.error ?? null });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [accountsRes, paymentsRes, unsubRes, sentRes, discountRes, previewRes, users] = await Promise.all([
      supabase.from("challenge_accounts").select("email, state, flags, package_key, breach_reason, created_at, synced_at"),
      supabase.from("payments").select("email"),
      supabase.from("email_unsubscribes").select("email"),
      supabase.from("followup_sent").select("email, track, step, sent_at"),
      supabase.from("discount_signups").select("email, created_at, lang"),
      supabase.from("preview_signups").select("email, created_at"),
      allAuthUsers(supabase),
    ]);
    for (const r of [accountsRes, paymentsRes, unsubRes, sentRes, discountRes, previewRes]) if (r.error) throw r.error;

    const lower = (s: unknown) => String(s ?? "").trim().toLowerCase();
    const unsub = new Set((unsubRes.data ?? []).map((r: { email: string }) => lower(r.email)));
    const accounts = accountsRes.data ?? [];
    const paid = new Set([
      ...accounts.map((a: { email: string }) => lower(a.email)),
      ...(paymentsRes.data ?? []).map((p: { email: string }) => lower(p.email)),
    ]);

    // ---------- trasa A: nekoupili ----------
    const firstSeen = new Map<string, { at: number; lang: string | null }>();
    const see = (email: string, iso: string, lang?: string | null) => {
      const e = lower(email);
      if (!e) return;
      const at = new Date(iso).getTime();
      const cur = firstSeen.get(e);
      if (!cur || at < cur.at) firstSeen.set(e, { at, lang: lang ?? cur?.lang ?? null });
      else if (lang && !cur.lang) cur.lang = lang;
    };
    for (const d of discountRes.data ?? []) see(d.email, d.created_at, d.lang);
    for (const p of previewRes.data ?? []) see(p.email, p.created_at);
    // deno-lint-ignore no-explicit-any
    for (const u of users as any[]) if (u.email) see(u.email, u.created_at);

    const candidates: Candidate[] = [];
    for (const [email, info] of firstSeen) {
      if (paid.has(email) || unsub.has(email)) continue;
      candidates.push({ email, track: "A", startAt: Math.max(info.at, FEATURE_START), lang: langFor(email, info.lang) });
    }

    // ---------- trasa B: spálený účet ----------
    const byEmail = new Map<string, typeof accounts>();
    for (const a of accounts) {
      const e = lower(a.email);
      if (!e) continue;
      byEmail.set(e, [...(byEmail.get(e) ?? []), a]);
    }
    for (const [email, list] of byEmail) {
      if (unsub.has(email)) continue;
      // znovu koupil / má živý účet → už není co resetovat
      if (list.some((a: { state: string }) => ["active", "funded", "pending_approval"].includes(a.state))) continue;
      const usable = list
        .filter((a: { state: string; flags: string[] | null }) => a.state === "breached" && !(Array.isArray(a.flags) && a.flags.includes("reset_used")))
        .sort((x: { created_at: string }, y: { created_at: string }) => (x.created_at < y.created_at ? 1 : -1));
      const acc = usable[0];
      if (!acc || !acc.package_key) continue;
      const closedAt = acc.synced_at ?? acc.created_at;
      candidates.push({
        email, track: "B", startAt: Math.max(new Date(closedAt).getTime(), FEATURE_START), lang: langFor(email),
        packageKey: acc.package_key, closedAt, reason: acc.breach_reason,
      });
    }

    // ---------- co je splatné ----------
    const sentRows = sentRes.data ?? [];
    const stepsSent = new Map<string, number>(); // "email|track" → nejvyšší odeslaný krok
    const lastSent = new Map<string, number>(); // email → čas posledního follow-upu
    for (const r of sentRows) {
      const e = lower(r.email);
      const k = `${e}|${r.track}`;
      stepsSent.set(k, Math.max(stepsSent.get(k) ?? 0, r.step));
      lastSent.set(e, Math.max(lastSent.get(e) ?? 0, new Date(r.sent_at).getTime()));
    }
    const now = Date.now();
    const due: (Candidate & { step: number })[] = [];
    for (const c of candidates) {
      const step = (stepsSent.get(`${c.email}|${c.track}`) ?? 0) + 1;
      if (step > STEP_DAYS.length) continue;
      if (now < c.startAt + STEP_DAYS[step - 1] * DAY) continue;
      if (now - (lastSent.get(c.email) ?? 0) < MIN_GAP_MS) continue;
      due.push({ ...c, step });
    }
    // nejstarší čekající první, ať se fronta po spuštění vyprazdňuje spravedlivě
    due.sort((a, b) => a.startAt - b.startAt);
    const batch = due.slice(0, MAX_PER_RUN);

    if (dryRun) {
      return jsonResponse({
        ok: true, dry_run: true, candidates: candidates.length, due: due.length, would_send: batch.length,
        sample: batch.slice(0, 20).map((c) => ({ email: c.email, track: c.track, step: c.step, lang: c.lang })),
      });
    }

    let sent = 0, failed = 0;
    for (const c of batch) {
      // nejdřív "zabrat" řádek (unique email+track+step brání dvojímu odeslání při překryvu běhů)
      const { error: claimErr } = await supabase.from("followup_sent").insert({ email: c.email, track: c.track, step: c.step });
      if (claimErr) continue;
      const link = await unsubscribeUrl(SITE_URL, c.email);
      const { subject, html } = renderFollowup(c.track, c.step, {
        lang: c.lang, siteUrl: SITE_URL, unsubscribeUrl: link,
        packageKey: c.packageKey, closedAt: c.closedAt, reason: c.reason,
      });
      const r = await sendEmail({
        to: c.email, subject, html,
        headers: { "List-Unsubscribe": `<${link}>, <mailto:support@fundly.games?subject=unsubscribe>` },
      });
      if (r.sent) sent++;
      else {
        failed++;
        console.error("email-followups odeslání selhalo:", c.email, c.track, c.step, r.error);
        await supabase.from("followup_sent").delete().eq("email", c.email).eq("track", c.track).eq("step", c.step);
      }
    }
    return jsonResponse({ ok: true, candidates: candidates.length, due: due.length, sent, failed });
  } catch (err) {
    console.error("email-followups error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Run failed." }, 500);
  }
});
