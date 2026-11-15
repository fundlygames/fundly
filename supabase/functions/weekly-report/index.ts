// weekly-report — týdenní e-mail s analýzou tipů (servisní/analytický e-mail, ne propagační).
// Pro každý aktivní / partner (funded) účet, který měl za posledních 7 dní aspoň jeden
// vyhodnocený tip: počet tipů, úspěšnost, ROI, zisk v % kapitálu, nejlepší a nejhorší segment
// (kurz / sport / liga / trh / single vs. kombinace / den), poznámka k disciplíně vkladů
// a postup k cíli fáze. Výpočty: _shared/weekly-report-stats.ts (obdoba js/analytics.js),
// šablona: _shared/weekly-report-email.ts, jazyk: _shared/user-lang.ts (cs/sk → česky).
//
// Chráněno x-admin-key (volá pg_cron/pg_net server-to-server, stejně jako account-maintenance).
// Tělo požadavku:
//   {}                                    → ostrý běh: pošle reporty, zapíše weekly_report_log
//   {"dry_run":true}                      → nic nepošle ani nezapíše, vrátí, co by odešlo
//   {"dry_run":true,"account_id":"…"}     → náhled jednoho účtu vč. HTML e-mailu
//   {"test_to":"x@y.cz","account_id":"…"} → pošle report účtu na zadanou adresu (bez logu,
//                                           ignoruje opt-out i "už odesláno"; předmět s [TEST])
// Idempotence: weekly_report_log (account_id, week_start) — week_start = pondělí (UTC) týdne,
//   do kterého spadá začátek období (teď − 7 dní). Řádek se zapíše před odesláním a při
//   selhání se smaže → opakovaný běh v tomtéž týdnu už nic znovu nepošle.
// Opt-out: challenge_accounts.weekly_report_opt_out (migrace 040) — odkaz v patičce e-mailu
//   (unsubscribe.html?type=weekly → email-unsubscribe). Účty se stejným e-mailem, kde je
//   opt-out zapnutý, se přeskočí taky.
//
// Plánování (pondělí 07:00 UTC) — Supabase dashboard → Database → Cron (pg_cron + pg_net):
//   select cron.schedule('weekly-report-monday', '0 7 * * 1', $$
//     select net.http_post(
//       url := 'https://<PROJECT_REF>.supabase.co/functions/v1/weekly-report',
//       headers := '{"Content-Type":"application/json","x-admin-key":"<ADMIN_API_KEY>"}'::jsonb,
//       body := '{}'::jsonb,
//       timeout_milliseconds := 120000
//     );
//   $$);
// Zrušení: select cron.unschedule('weekly-report-monday');
//
// Env: RESEND_API_KEY, RESEND_FROM (sendEmail), ADMIN_API_KEY, SITE_URL (výchozí https://fundly.games),
//      UNSUBSCRIBE_SECRET nebo CRON_SECRET (podpis odhlašovacího odkazu).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { isValidAdminKey } from "../_shared/admin.ts";
import { sendEmail } from "../_shared/email.ts";
import { userLang } from "../_shared/user-lang.ts";
import { packageByKey } from "../_shared/packages.ts";
import { weeklyUnsubscribeUrl } from "../_shared/unsubscribe.ts";
import { type PhaseAccount, provenPhaseProfit, targetProfit } from "../_shared/phase-expiry.ts";
import { isSettledTip, mondayUtc, type ReportTicket, weeklyStats } from "../_shared/weekly-report-stats.ts";
import { weeklyReportHtml, weeklyReportSubject } from "../_shared/weekly-report-email.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://fundly.games";
const DAY_MS = 86400000;
const STATES = ["active", "funded", "pending_approval"];
const ACCOUNT_COLS = "id, user_id, email, package_key, capital, phase, state, phase_started_at, phase_bonus_days, phase_balance, phase_baseline, weekly_report_opt_out";
const TICKET_COLS = "account_id, stake, payout, status, placed_at, settled_at, combined_odds, selections, admission_note";

type Account = PhaseAccount & { user_id: string | null; weekly_report_opt_out: boolean | null };
type Row = ReportTicket & { account_id: string };

const mask = (e: string | null) => { const [u, d] = String(e ?? "?@?").split("@"); return `${u.slice(0, 3)}***@${d}`; };
const chunks = <T>(a: T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!(await isValidAdminKey(req))) return jsonResponse({ error: "Unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    const testTo = typeof body.test_to === "string" ? body.test_to.trim() : "";
    const accountId = typeof body.account_id === "string" ? body.account_id.trim() : "";
    if (testTo && (!accountId || !isEmail(testTo))) {
      return jsonResponse({ error: "test mode needs a valid test_to and an account_id" }, 400);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const toMs = Date.now();
    const fromMs = toMs - 7 * DAY_MS;
    const fromIso = new Date(fromMs).toISOString();
    const historyIso = new Date(fromMs - 7 * DAY_MS).toISOString(); // kvůli "vklad po prohraném tipu"
    const weekStart = mondayUtc(fromMs);

    // ---------- účty ----------
    let accQuery = supabase.from("challenge_accounts").select(ACCOUNT_COLS);
    accQuery = accountId ? accQuery.eq("id", accountId) : accQuery.in("state", STATES).not("email", "is", null);
    const { data: accRows, error: accError } = await accQuery;
    if (accError) throw accError;
    const accounts = (accRows ?? []) as Account[];
    if (accountId && !accounts.length) return jsonResponse({ error: "account not found" }, 404);

    // opt-out platí pro e-mail (i když ho hráč nastavil na jiném, např. starším účtu)
    const { data: optRows, error: optError } = await supabase
      .from("challenge_accounts").select("email").eq("weekly_report_opt_out", true);
    if (optError) throw optError;
    const optedOut = new Set((optRows ?? []).map((r) => String(r.email ?? "").trim().toLowerCase()));

    // ---------- tipy za období (+ týden historie) ----------
    const byAccount = new Map<string, Row[]>();
    for (const ids of chunks(accounts.map((a) => a.id), 50)) {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("tickets").select(TICKET_COLS)
          .in("account_id", ids)
          .or(`settled_at.gte."${fromIso}",placed_at.gte."${historyIso}"`)
          .order("placed_at", { ascending: true })
          .range(from, from + 999);
        if (error) throw error;
        for (const t of (data ?? []) as Row[]) {
          if (!byAccount.has(t.account_id)) byAccount.set(t.account_id, []);
          byAccount.get(t.account_id)!.push(t);
        }
        if (!data || data.length < 1000) break;
      }
    }

    const inWindow = (t: Row) => isSettledTip(t) && !!t.settled_at && Date.parse(t.settled_at) >= fromMs;
    const eligible = accounts.filter((a) => testTo || (byAccount.get(a.id) ?? []).some(inWindow));

    // ---------- už odesláno tento týden ----------
    const alreadySent = new Set<string>();
    if (!testTo) {
      for (const ids of chunks(eligible.map((a) => a.id), 200)) {
        const { data, error } = await supabase.from("weekly_report_log").select("account_id").eq("week_start", weekStart).in("account_id", ids);
        if (error) throw error;
        (data ?? []).forEach((r) => alreadySent.add(r.account_id));
      }
    }

    const items: Record<string, unknown>[] = [];
    let sent = 0, failed = 0, skippedOptOut = 0, skippedAlready = 0;

    for (const a of eligible) {
      const email = String(a.email ?? "").trim().toLowerCase();
      const who = mask(email);
      if (!testTo) {
        if (!email) continue;
        if (a.weekly_report_opt_out || optedOut.has(email)) { skippedOptOut++; items.push({ who, account_id: a.id, skipped: "opt_out" }); continue; }
        if (alreadySent.has(a.id)) { skippedAlready++; items.push({ who, account_id: a.id, skipped: "already_sent" }); continue; }
      }

      const pkg = packageByKey(String(a.package_key ?? ""));
      const cap = Number(a.capital) > 0 ? Number(a.capital) : (pkg?.cap ?? 0);
      const tix = byAccount.get(a.id) ?? [];
      const stats = weeklyStats(tix, cap, fromMs, toMs);
      const phase = a.state === "funded" || Number(a.phase) >= 3 ? 3 : Number(a.phase) || 1;

      // postup k cíli fáze: zisk z tipů od začátku fáze (stejně jako account-maintenance)
      let progress: { profit: number; target: number } | null = null;
      if ((phase === 1 || phase === 2) && a.phase_started_at) {
        const { data: phaseTix, error: phaseError } = await supabase.from("tickets")
          .select("stake, payout, status, placed_at").eq("account_id", a.id).gte("placed_at", a.phase_started_at);
        if (phaseError) throw phaseError;
        const acc = { ...a, capital: cap, phase } as PhaseAccount;
        progress = { profit: Math.round(provenPhaseProfit(acc, phaseTix ?? [])), target: targetProfit(acc) };
      }

      const lang = await userLang(supabase, { userId: a.user_id, email: email || null });
      const unsubscribeLink = await weeklyUnsubscribeUrl(SITE_URL, email || testTo);
      const html = weeklyReportHtml({
        pkgName: pkg?.name ?? String(a.package_key ?? "Fundly"),
        phase, stats, fromMs, toMs, progress,
        dashboardLink: `${SITE_URL}/dashboard#analytics`,
        unsubscribeLink,
      }, lang);
      const subject = weeklyReportSubject(stats, lang);

      const item: Record<string, unknown> = {
        who, account_id: a.id, lang, phase, tips: stats.tips,
        win_rate: stats.winRate === null ? null : Math.round(stats.winRate * 100),
        roi: Math.round(stats.roi * 1000) / 10,
        profit_pct: stats.profitPctOfCap === null ? null : Math.round(stats.profitPctOfCap * 100) / 100,
        best: stats.best ? `${stats.best.dim}:${stats.best.key}` : null,
        worst: stats.worst ? `${stats.worst.dim}:${stats.worst.key}` : null,
        discipline: stats.discipline.note.kind,
        progress, subject,
      };
      items.push(item);

      if (dryRun) {
        if (accountId) item.html = html;
        continue;
      }

      const headers = { "List-Unsubscribe": `<${unsubscribeLink}>, <mailto:support@fundly.games?subject=unsubscribe%20weekly%20report>` };
      if (testTo) {
        const r = await sendEmail({ to: testTo, subject: `[TEST] ${subject}`, html, headers });
        item.sent = r.sent;
        if (r.error) item.error = r.error;
        if (!stats.tips) item.warning = "no settled tips in the last 7 days";
        if (r.sent) sent++;
        else failed++;
        continue;
      }

      // claim před odesláním — souběžný/opakovaný běh narazí na primární klíč
      const { error: claimError } = await supabase.from("weekly_report_log").insert({ account_id: a.id, week_start: weekStart, email });
      if (claimError) {
        if ((claimError as { code?: string }).code === "23505") { skippedAlready++; item.skipped = "already_sent"; continue; }
        throw claimError;
      }
      const r = await sendEmail({ to: email, subject, html, headers });
      item.sent = r.sent;
      if (r.sent) { sent++; continue; }
      failed++;
      item.error = r.error;
      console.error("weekly-report e-mail selhal:", a.id, r.error);
      await supabase.from("weekly_report_log").delete().eq("account_id", a.id).eq("week_start", weekStart);
    }

    return jsonResponse({
      ok: true,
      mode: testTo ? "test" : dryRun ? "dry_run" : "live",
      week_start: weekStart,
      period: { from: fromIso, to: new Date(toMs).toISOString() },
      accounts: accounts.length,
      eligible: eligible.length,
      sent, failed, skipped_opt_out: skippedOptOut, skipped_already_sent: skippedAlready,
      items,
    });
  } catch (err) {
    console.error("weekly-report error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
