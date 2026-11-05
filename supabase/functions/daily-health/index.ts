// daily-health — ranní kontrola celé platformy + automatické opravy bezpečných věcí + e-mailový report.
// Volá ho pg_cron každé ráno (06:30 UTC) s x-admin-key; ručně lze spustit POST { dry_run: true } (nic nemění
// a neposílá e-mail) nebo { send: false }. Co dělá:
//   1. sbírá interní čísla (SQL platform_health()): cron joby, tikety, účty, platby, support, návštěvnost
//   2. testuje zvenku: web + jeho soubory, Whop (API klíč, ceny plánů, embed, webhook), vlastní funkce, odds-api, Supabase Auth
//   3. opravuje samo to, co je bezpečné a vratné: zaseknuté tikety (spustí vyhodnocení), zastaralé cron joby (spustí je
//      ručně), úklid testovacích účtů a staré pomocné tabulky
//   4. pošle report: 🟢 vše OK / 🟠 pozor / 🔴 kritické — co se opravilo samo a co musí udělat člověk
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { isValidAdminKey } from "../_shared/admin.ts";
import { sendEmail } from "../_shared/email.ts";
import { whopFetch } from "../_shared/whop.ts";
import { PACKAGES, whopPlanId } from "../_shared/packages.ts";

const SITE = (Deno.env.get("SITE_URL") ?? "https://fundly.games").replace(/\/$/, "");
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ADMIN_KEY = Deno.env.get("ADMIN_API_KEY") ?? "";

type Sev = "critical" | "attention" | "info";
interface Issue { sev: Sev; title: string; detail?: string; how?: string }
interface Check { group: string; name: string; ok: boolean; ms: number; detail?: string }

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const mins = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 60000 : Infinity);
const ago = (iso: string | null) => { const m = mins(iso); return !Number.isFinite(m) ? "nikdy" : m < 90 ? `${Math.round(m)} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} dní`; };

async function timed(group: string, name: string, fn: () => Promise<string | void>): Promise<Check> {
  const t0 = Date.now();
  try {
    const detail = await Promise.race([fn(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout 12 s")), 12000))]);
    return { group, name, ok: true, ms: Date.now() - t0, detail: detail || undefined };
  } catch (e) {
    return { group, name, ok: false, ms: Date.now() - t0, detail: e instanceof Error ? e.message : String(e) };
  }
}
async function expectStatus(url: string, want: number[], init?: RequestInit): Promise<string> {
  const r = await fetch(url, { ...init, redirect: "follow", signal: AbortSignal.timeout(10000) });
  if (!want.includes(r.status)) throw new Error(`HTTP ${r.status} (čekáno ${want.join("/")})`);
  return `HTTP ${r.status}`;
}

serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!(await isValidAdminKey(req))) return jsonResponse({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const dry = body.dry_run === true;
  const send = !dry && body.send !== false;
  const supabase = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const issues: Issue[] = [];
  const fixes: string[] = [];
  const add = (sev: Sev, title: string, detail?: string, how?: string) => issues.push({ sev, title, detail, how });

  // ---------- 1) interní čísla ----------
  const readHealth = async () => {
    const { data, error } = await supabase.rpc("platform_health");
    if (error) throw error;
    // deno-lint-ignore no-explicit-any
    return (typeof data === "string" ? JSON.parse(data) : data) as any;
  };
  // deno-lint-ignore no-explicit-any
  let h: any;
  try { h = await readHealth(); } catch (e) {
    add("critical", "Databáze neodpovídá (platform_health selhala)", e instanceof Error ? e.message : JSON.stringify(e), "Zkontrolujte Supabase projekt (dashboard → Database / Status).");
    h = null;
  }

  // ---------- 2) kontroly zvenku ----------
  const checks: Check[] = [];
  const run = async (list: Promise<Check>[]) => { checks.push(...(await Promise.all(list))); };

  const fn = (name: string) => `${SB_URL}/functions/v1/${name}`;
  const post = (name: string, payload: unknown = {}) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

  // web + jeho soubory (stejné odkazy, jaké vidí návštěvník)
  const pages = ["/", "/checkout", "/dashboard", "/get-started", "/rules", "/terms", "/investors"];
  await run(pages.map((p) => timed("Web", `Stránka ${p}`, () => expectStatus(SITE + p, [200]))));
  await run([timed("Web", "Soubory stránky (JS/CSS) se načítají", async () => {
    const html = await (await fetch(SITE + "/", { signal: AbortSignal.timeout(10000) })).text();
    const urls = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map((m) => m[1]);
    const uniq = [...new Set(urls)];
    const bad: string[] = [];
    await Promise.all(uniq.map(async (u) => { const r = await fetch(`${SITE}/${u}`, { signal: AbortSignal.timeout(10000) }); if (!r.ok) bad.push(`${u} → ${r.status}`); }));
    if (bad.length) throw new Error(bad.join(", "));
    return `${uniq.length} souborů OK`;
  })]);

  // platební brána Whop: API klíč, ceny plánů, embed skript, webhook
  await run([
    ...["starter", "standard", "advanced", "pro", "elite"].map((k) => timed("Platby", `Whop plán ${PACKAGES[k].name}`, async () => {
      const id = whopPlanId(k);
      if (!id) throw new Error(`chybí secret WHOP_PLAN_${k.toUpperCase()}`);
      const p = await whopFetch(`/plans/${id}`);
      if (p.visibility !== "visible" || p.release_method !== "buy_now") throw new Error(`plán není prodejný (visibility=${p.visibility}, release=${p.release_method})`);
      if (Number(p.initial_price) !== PACKAGES[k].price) throw new Error(`cena ve Whopu ${p.initial_price} ≠ ${PACKAGES[k].price} v kódu`);
      return `$${p.initial_price}`;
    })),
    timed("Platby", "Whop platební formulář (elements.js)", () => expectStatus("https://cdn.whop.com/elements/amber/elements.js", [200])),
    timed("Platby", "Webhook Whop odpovídá (nepodepsaný = 401)", () => expectStatus(fn("whop-webhook"), [401], post("whop-webhook", { type: "ping" }))),
    timed("Platby", "Vytvoření platby (whop-checkout odmítne neznámý balíček)", () => expectStatus(fn("whop-checkout"), [400], post("whop-checkout", { packageKey: "nonexistent", email: "health@check.local" }))),
    timed("Platby", "Kapacita checkoutu (checkout-availability)", () => expectStatus(fn("checkout-availability"), [200], post("checkout-availability"))),
  ]);

  // vlastní backend + zdroje dat + e-mail
  await run([
    timed("Backend", "Supabase Auth", () => expectStatus(`${SB_URL}/auth/v1/health`, [200], { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" } })),
    timed("Backend", "Obnova účtu (restore-account vyžaduje přihlášení)", () => expectStatus(fn("restore-account"), [401], post("restore-account"))),
    timed("Backend", "Rebříček (leaderboard-get)", () => expectStatus(fn("leaderboard-get"), [200], post("leaderboard-get"))),
    timed("Backend", "Stránka investorů vyžaduje přihlášení", () => expectStatus(fn("investor-stats"), [401], post("investor-stats"))),
    timed("Backend", "Měření návštěvnosti (track-visit)", () => expectStatus(fn("track-visit"), [200], { method: "POST", headers: { "Content-Type": "text/plain", "User-Agent": "Mozilla/5.0 health" }, body: JSON.stringify({ path: "/admin" }) })),
    timed("Data", "Kurzy a zápasy (odds-api.io)", async () => {
      const k = Deno.env.get("ODDS_API_KEY");
      if (!k) throw new Error("chybí ODDS_API_KEY");
      const r = await fetch(`https://api.odds-api.io/v3/events?apiKey=${k}&sport=football&status=pending&limit=5`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 401 || r.status === 403 ? " — klíč/členství vypršelo?" : r.status === 429 ? " — vyčerpaný limit" : ""}`);
      const j = await r.json(); const n = Array.isArray(j) ? j.length : (j.events ?? j.data ?? []).length;
      if (!n) throw new Error("žádné nadcházející zápasy");
      return `${n}+ zápasů`;
    }),
    timed("E-mail", "Resend (odesílání e-mailů)", async () => { if (!Deno.env.get("RESEND_API_KEY")) throw new Error("chybí RESEND_API_KEY"); }),
  ]);

  // ---------- vyhodnocení ----------
  const failed = checks.filter((c) => !c.ok);
  for (const c of failed) {
    const critical = c.group === "Platby" || c.group === "Web" || c.name === "Supabase Auth";
    const hint = /plán|Whop/.test(c.name) && /unauthor|401|403|Invalid/i.test(c.detail ?? "") ? "Whop API klíč pravděpodobně vypršel/zneplatnil se — vytvořte nový ve Whopu a nastavte secret WHOP_API_KEY (supabase secrets set)." : undefined;
    add(critical ? "critical" : "attention", `${c.group}: ${c.name} nefunguje`, c.detail, hint);
  }

  if (h) {
    // cron joby
    const MAXAGE: Record<string, number> = { "settle-tickets-10min": 25, "odds-snapshot-15min": 45, "email-recovery-15min": 45, "account-maintenance-daily": 26 * 60, "email-followups-daily": 26 * 60 };
    const staleJobs: string[] = [];
    for (const j of h.cron as { job: string; active: boolean; last_start: string | null; last_status: string | null; failed_24h: number }[]) {
      if (!j.active) { add("attention", `Cron ${j.job} je vypnutý`, undefined, "Zapněte ho v Supabase (cron.alter_job)."); continue; }
      const max = MAXAGE[j.job];
      if (max && mins(j.last_start) > max) { staleJobs.push(j.job); add("critical", `Cron ${j.job} neběží`, `naposledy před ${ago(j.last_start)}`, "Automaticky zkouším spustit ručně; pokud to nepomůže, zkontrolujte pg_cron v Supabase."); }
      else if (j.last_status && j.last_status !== "succeeded" && j.job !== "daily-health") add("attention", `Cron ${j.job}: poslední běh skončil chybou`, j.last_status);
    }
    if (h.http_5xx_24h > 5) add("attention", `${h.http_5xx_24h}× chyba 500 u cron volání za 24 h`, undefined, "Podívejte se do logů Edge Functions v Supabase.");

    // tikety
    const t = h.tickets;
    let stuck = Number(t.stuck_pending) || 0;
    if ((stuck > 0 || staleJobs.includes("settle-tickets-10min")) && !dry && ADMIN_KEY) {
      const r = await fetch(fn("settle-tickets"), { ...post("settle-tickets"), headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY }, signal: AbortSignal.timeout(50000) }).then((x) => x.json()).catch((e) => ({ error: String(e) }));
      fixes.push(`Spuštěno vyhodnocení tiketů (settle-tickets): ${JSON.stringify(r).slice(0, 160)}`);
      try { stuck = Number((await readHealth()).tickets.stuck_pending) || 0; } catch { /* ponecháme původní */ }
    }
    if (stuck > 0) add("critical", `${stuck} tiketů je zaseknutých ve stavu „čeká" i 36+ h po začátku zápasu`, undefined, "Zkontrolujte zápasy těchto tiketů v odds-api (zápas mohl zmizet) a případně tikety vraťte v Admin → Hráči.");
    if (t.voided_24h > 0) add("attention", `${t.voided_24h} tiketů bylo za 24 h stornováno kontrolou při podání`, (t.void_reasons_24h as { reason: string; n: number }[]).map((x) => `${x.n}× ${x.reason}`).join("; "), "Zkontrolujte, že nejde o oprávněné sázky (falešné zamítnutí). Vypínač: TICKET_ADMISSION_ENFORCE=false.");
    if (t.balance_rejections_24h > 0) add("attention", `${t.balance_rejections_24h}× server odmítl nahlášený zůstatek hráče`, undefined, "Možný pokus o manipulaci — tabulka balance_sync_audit.");
    if (t.pending > 0 && mins(h.growth.snapshots_last) > 60 * 6) add("attention", "Snímky kurzů (odds_snapshots) se neukládají", `poslední před ${ago(h.growth.snapshots_last)}`, "Kontrola funkce odds-snapshot.");

    // cron, který se dá bezpečně rozběhnout ručně
    const rerun = async (name: string, why: string, payload: unknown = {}) => {
      if (dry || !ADMIN_KEY) return;
      const r = await fetch(fn(name), { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": ADMIN_KEY }, body: JSON.stringify(payload), signal: AbortSignal.timeout(50000) }).then((x) => `HTTP ${x.status}`).catch((e) => String(e));
      fixes.push(`Ručně spuštěno ${name} (${why}): ${r}`);
    };
    if (staleJobs.includes("odds-snapshot-15min")) await rerun("odds-snapshot", "cron neběžel");
    if (staleJobs.includes("account-maintenance-daily")) await rerun("account-maintenance", "denní údržba neproběhla");

    // účty
    const a = h.accounts;
    if (a.closed_24h > 0) add("info", `${a.closed_24h} účtů bylo za 24 h uzavřeno`, (a.closed_reasons_24h as { reason: string; n: number }[]).map((x) => `${x.n}× ${x.reason}`).join("; "));
    if ((a.pending_approval as unknown[]).length) add("attention", `${(a.pending_approval as unknown[]).length} hráčů čeká na schválení další fáze`, (a.pending_approval as { email: string }[]).map((x) => x.email).join(", "), "Admin → Hráči → schválit/zamítnout.");
    if ((a.expiring_3d as unknown[]).length) add("info", `${(a.expiring_3d as unknown[]).length} hráčům končí lhůta fáze do 3 dnů`, (a.expiring_3d as { email: string; deadline: string }[]).map((x) => `${x.email} (${String(x.deadline).slice(0, 10)})`).join(", "));
    if (a.overdue_not_closed > 0) add("info", `${a.overdue_not_closed} účtů je po termínu fáze, ale zůstává aktivních`, "Je to záměr u hráčů, kteří cíl fáze splnili, a u interních účtů; jinak zkontrolujte account-maintenance.");

    // peníze
    const p = h.payments;
    if ((p.orphans as unknown[]).length) add("critical", `Zaplaceno, ale účet nevznikl (${(p.orphans as unknown[]).length}×)`, (p.orphans as { email: string; package: string; paid_at: string; payment: string }[]).map((x) => `${x.email} · ${x.package} · ${String(x.paid_at).slice(0, 16)} · ${x.payment}`).join("\n"), "Zákazník zaplatil a nic nedostal — založte mu účet (Whop webhook mohl selhat; v logu whop-webhook je důvod) a napište mu.");
    if (p.failed_24h >= 3 && p.succeeded_24h === 0) add("attention", `${p.failed_24h} neúspěšných plateb a žádná úspěšná za 24 h`, undefined, "Zkontrolujte platební formulář ručně (checkout → test platby) a Whop dashboard.");
    const daysNoSale = Math.floor(mins(p.last_success_at) / 1440);
    if (daysNoSale >= 7) add("info", `Poslední prodej byl před ${daysNoSale} dny`);

    // support, výplaty, waitlist
    const s = h.support;
    const open = s.open as { subject: string; email: string; message: string; age_h: number }[];
    if (open.some((x) => x.age_h >= 24)) add("attention", `${open.filter((x) => x.age_h >= 24).length} tiketů podpory čeká na odpověď déle než 24 h`, open.map((x) => `[${x.age_h} h] ${x.email}: ${x.subject} — ${x.message}`).join("\n"), "Admin → Support → odpovědět.");
    else if (open.length) add("attention", `${open.length} nových tiketů podpory`, open.map((x) => `${x.email}: ${x.subject} — ${x.message}`).join("\n"), "Admin → Support → odpovědět.");
    if ((s.payouts_pending as unknown[]).length) add("attention", `${(s.payouts_pending as unknown[]).length} žádostí o výplatu čeká na schválení`, undefined, "Admin → Hráči → výplaty.");
    if (s.waitlist_waiting > 0) add("info", `${s.waitlist_waiting} lidí na waitlistu`);

    // návštěvnost
    const g = h.growth;
    if (g.visits_24h === 0 && g.visits_prev_24h > 0) add("attention", "Měření návštěvnosti nic nezaznamenalo za 24 h", `předchozích 24 h: ${g.visits_prev_24h}`, "Buď web neměl žádné návštěvy, nebo přestal fungovat js/track.js / funkce track-visit.");

    // úklid (bezpečné a vratné)
    if (!dry) {
      const cut = new Date(Date.now() - 7 * 86400000).toISOString();
      await supabase.from("email_throttle").delete().lt("last_at", cut);
      await supabase.from("site_visits").delete().lt("ts", new Date(Date.now() - 400 * 86400000).toISOString());
      if (h.leftovers.test_users > 0) {
        const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const old = (list?.users ?? []).filter((u: { email?: string; created_at: string }) => /@example\.com$/i.test(u.email ?? "") && Date.now() - new Date(u.created_at).getTime() > 86400000).slice(0, 25);
        let removed = 0;
        for (const u of old) {
          const { data: accs } = await supabase.from("challenge_accounts").select("id").eq("user_id", u.id);
          for (const x of accs ?? []) { await supabase.from("tickets").delete().eq("account_id", x.id); await supabase.from("balance_sync_audit").delete().eq("account_id", x.id); }
          await supabase.from("challenge_accounts").delete().eq("user_id", u.id);
          const { error } = await supabase.auth.admin.deleteUser(u.id);
          if (!error) removed++;
        }
        if (removed) fixes.push(`Smazáno ${removed} zapomenutých testovacích účtů (@example.com)`);
      }
    }
  }

  // ---------- výsledek ----------
  const rank = { critical: 0, attention: 1, info: 2 } as const;
  issues.sort((x, y) => rank[x.sev] - rank[y.sev]);
  const status = issues.some((i) => i.sev === "critical") ? "critical" : issues.some((i) => i.sev === "attention") ? "attention" : "ok";
  const actionable = issues.filter((i) => i.sev !== "info").length;

  const color = { critical: "#ff5c5c", attention: "#ffb84d", ok: "#14f195" }[status];
  const label = { critical: "🔴 KRITICKÉ — vyžaduje okamžitou akci", attention: "🟠 Pozor — je co vyřídit", ok: "🟢 Všechno funguje" }[status];
  const dateLabel = new Date().toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Prague" });
  const sevIcon = { critical: "🔴", attention: "🟠", info: "ℹ️" } as const;
  const row = (c: Check) => `<tr><td style="padding:5px 8px;color:${c.ok ? "#14f195" : "#ff5c5c"}">${c.ok ? "✓" : "✗"}</td><td style="padding:5px 8px">${esc(c.name)}</td><td style="padding:5px 8px;color:#8a8a98;font-size:12px">${esc(c.detail ?? "")}</td></tr>`;
  const groups = [...new Set(checks.map((c) => c.group))];
  const yesterday = h ? `Návštěvníci za 24 h: <b>${h.growth.visits_24h}</b> · Nové registrace: <b>${h.growth.signups_24h}</b> · Platby: <b>${h.payments.succeeded_24h}</b> ($${Math.round(h.payments.amount_24h)}) · Tikety podané/vyhodnocené: <b>${h.tickets.placed_24h}</b>/<b>${h.tickets.settled_24h}</b> · Aktivní hráči: <b>${h.accounts.active}</b>` : "—";

  const html = `<div style="background:#020204;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
  <div style="max-width:720px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:24px">
    <div style="color:#14f195;font-weight:800;font-size:18px">fundly · ranný report</div>
    <div style="color:#8a8a98;font-size:13px;margin:2px 0 14px">${esc(dateLabel)}</div>
    <div style="border-left:4px solid ${color};background:#ffffff08;padding:12px 14px;border-radius:8px;font-size:17px;font-weight:700">${label}</div>
    ${fixes.length ? `<h3 style="margin:20px 0 6px;font-size:14px">🛠 Opravilo se automaticky</h3><ul style="margin:0;padding-left:18px;color:#c9c9d3;font-size:13px">${fixes.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    ${issues.length ? `<h3 style="margin:20px 0 6px;font-size:14px">Co je třeba vyřešit (${actionable}) a poznámky</h3>${issues.map((i) => `<div style="margin:8px 0;padding:10px 12px;background:#ffffff08;border-radius:10px"><div style="font-weight:700;font-size:14px">${sevIcon[i.sev]} ${esc(i.title)}</div>${i.detail ? `<div style="color:#a0a0ab;font-size:12.5px;margin-top:4px;white-space:pre-wrap">${esc(i.detail)}</div>` : ""}${i.how ? `<div style="color:#14f195;font-size:12.5px;margin-top:4px">→ ${esc(i.how)}</div>` : ""}</div>`).join("")}` : `<p style="color:#a0a0ab;font-size:14px">Žádné problémy — web, platby, tikety, cron joby i podpora jsou v pořádku.</p>`}
    <h3 style="margin:20px 0 6px;font-size:14px">Včerejšek v číslech</h3><div style="color:#c9c9d3;font-size:13px;line-height:1.7">${yesterday}</div>
    <h3 style="margin:20px 0 6px;font-size:14px">Kontroly (${checks.filter((c) => c.ok).length}/${checks.length} v pořádku)</h3>
    ${groups.map((gr) => `<div style="color:#8a8a98;font-size:11px;letter-spacing:.1em;text-transform:uppercase;margin-top:10px">${esc(gr)}</div><table style="width:100%;border-collapse:collapse;font-size:13px">${checks.filter((c) => c.group === gr).map(row).join("")}</table>`).join("")}
    <p style="color:#5a5a66;font-size:11px;margin:20px 0 0">Automatický report funkce daily-health (každé ráno 06:30 UTC). Vypnout/změnit adresu: secret HEALTH_REPORT_EMAIL.</p>
  </div></div>`;

  let emailSent = false;
  let emailError: string | undefined;
  if (send) {
    const to = Deno.env.get("HEALTH_REPORT_EMAIL") ?? Deno.env.get("SUPPORT_NOTIFY_EMAIL") ?? "support@fundly.games";
    const subject = `${status === "ok" ? "🟢" : status === "attention" ? "🟠" : "🔴"} Fundly — ranný report: ${status === "ok" ? "všechno OK" : status === "attention" ? `${actionable} věcí k vyřízení` : "KRITICKÉ"} (${new Date().toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", timeZone: "Europe/Prague" })})`;
    const r = await sendEmail({ to, subject, html });
    emailSent = r.sent; emailError = r.error;
    if (!r.sent) console.error("daily-health e-mail selhal:", r.error);
  }
  if (!dry) {
    await supabase.from("health_reports").insert({ status, issues: actionable, email_sent: emailSent, summary: { issues, fixes, failed_checks: failed.map((c) => `${c.group}: ${c.name} — ${c.detail}`), checks_total: checks.length } });
  }

  return jsonResponse({ ok: true, status, issues: issues.map((i) => ({ sev: i.sev, title: i.title })), fixes, checks_failed: failed.map((c) => `${c.name}: ${c.detail}`), checks_ok: checks.length - failed.length, email: send ? { sent: emailSent, error: emailError } : "skipped", dry_run: dry });
});
