// account-maintenance — denní údržba účtů (cron, viz docs/WHOP-SETUP.md).
// Pravidlo neaktivity: min. 1 tiket / 14 dní na funded účtu.
//   den 7  bez tiketu  → inactivity_warned_7  (banner v dashboardu)
//   den 13 bez tiketu  → inactivity_warned_13 (poslední upozornění)
//   den 14 bez tiketu  → účet se spálí (state → breached, funded status zrušen,
//                         + e-mail — viz accountClosedHtml v _shared/email.ts)
// Pravidlo času fáze (terms §4.1/4.2): fáze 1 a 2 mají 30 kalendářních dní
// (+ phase_bonus_days). Po uplynutí bez splněného cíle se účet zavře jako
// breached (viz _shared/phase-expiry.ts), hráč dostane e-mail s nabídkou resetu.
// Upozornění: jakmile do konce lhůty zbývají ≤ 3 dny a hráč cíl fáze ještě nesplnil, dostane
// e-mail (jednou na daný termín — viz phase_expiry_warned_for, migrace 028).
// BEZPEČNOSTNÍ PŘEPÍNAČ (platí pro zavírání i pro upozornění): zavírání se provede jen s nastaveným secretem
// PHASE_EXPIRY_ENFORCE=true; bez něj (nebo s body {"dry_run":true}) funkce jen
// vypíše, koho by zavřela. Výjimky: PHASE_EXPIRY_EXCLUDE (e-maily oddělené čárkou).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { isValidAdminKey } from "../_shared/admin.ts";
import { sendEmail, accountClosedHtml, phaseExpiryWarningHtml } from "../_shared/email.ts";
import { packageByKey, resetPrice } from "../_shared/packages.ts";
import { type PhaseAccount, type PhaseTicket, isPhaseExpired, reachedPhaseTarget, provenPhaseProfit, targetProfit, phaseWarningDeadline, isExcludedFromExpiry, expiryReason, phaseDeadlineMs } from "../_shared/phase-expiry.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://fundly.games";

const WARN_1_DAYS = 7;
const WARN_2_DAYS = 13;
const BURN_DAYS = 14;

serve(async (req) => {
  // volá pg_cron/pg_net server-to-server, chráněno x-admin-key (může
  // burnout skutečné účty, proto přísnější než např. meta-ads-spend)
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!(await isValidAdminKey(req))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: accounts, error } = await supabase
      .from("challenge_accounts")
      .select("id, email, package_key, funded_at, last_ticket_at, inactivity_warned_7, inactivity_warned_13, created_at")
      .eq("state", "funded");
    if (error) throw error;

    const now = Date.now();
    let warned7 = 0, warned13 = 0, burned = 0;

    // ---------- čas fáze (fáze 1/2) ----------
    const body = await req.json().catch(() => ({}));
    const enforce = Deno.env.get("PHASE_EXPIRY_ENFORCE") === "true" && body.dry_run !== true;
    const extraExcluded = (Deno.env.get("PHASE_EXPIRY_EXCLUDE") ?? "").split(",");
    const { data: phaseAccounts, error: phaseError } = await supabase
      .from("challenge_accounts")
      .select("id, email, package_key, capital, phase, state, phase_started_at, phase_bonus_days, phase_balance, phase_baseline, phase_expiry_warned_for")
      .eq("state", "active")
      .in("phase", [1, 2])
      .not("phase_started_at", "is", null);
    if (phaseError) throw phaseError;
    const mask = (e: string | null) => { const [u, d] = String(e ?? "?@?").split("@"); return `${u.slice(0, 3)}***@${d}`; };
    const overdue = ((phaseAccounts ?? []) as PhaseAccount[]).filter((a) =>
      !isExcludedFromExpiry(a, extraExcluded) && isPhaseExpired(a, now)
    );
    const ticketsOf = async (a: PhaseAccount): Promise<PhaseTicket[]> => {
      const { data: tix } = await supabase
        .from("tickets")
        .select("stake, payout, status, placed_at")
        .eq("account_id", a.id)
        .gte("placed_at", a.phase_started_at!);
      return (tix ?? []) as PhaseTicket[];
    };
    // ochrana: kdo cíl fáze DOKÁZANĚ splnil (z tiketů, ne z uloženého zůstatku), se pro čas nezavírá
    const expiredAccounts: PhaseAccount[] = [];
    for (const a of overdue) {
      if (!reachedPhaseTarget(a, await ticketsOf(a))) expiredAccounts.push(a);
    }

    // ---------- upozornění pár dní před koncem lhůty ----------
    const warnings: { who: string; phase: number; deadline: string; daysLeft: number; remainingProfit: number; sent?: boolean }[] = [];
    for (const a of (phaseAccounts ?? []) as PhaseAccount[]) {
      if (isExcludedFromExpiry(a, extraExcluded) || !a.email) continue;
      const deadline = phaseWarningDeadline(a, now);
      if (deadline === null) continue;
      const tix = await ticketsOf(a);
      if (reachedPhaseTarget(a, tix)) continue; // cíl splněn — nemá smysl strašit termínem
      const daysLeft = Math.max(1, Math.ceil((deadline - now) / 86400000));
      const remainingProfit = Math.max(0, Math.round(targetProfit(a) - provenPhaseProfit(a, tix)));
      const entry: (typeof warnings)[number] = {
        who: mask(a.email), phase: a.phase, deadline: new Date(deadline).toISOString().slice(0, 10), daysLeft, remainingProfit,
      };
      warnings.push(entry);
      if (!enforce) continue;
      const pkg = packageByKey(String(a.package_key ?? ""));
      const r = await sendEmail({
        to: String(a.email),
        subject: `Your Fundly Phase ${a.phase} time limit ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`,
        html: phaseExpiryWarningHtml({
          pkgName: pkg.name, phase: a.phase,
          deadlineLabel: new Date(deadline).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
          daysLeft, remainingProfit, targetProfit: targetProfit(a), resetPrice: resetPrice(pkg),
          dashboardLink: `${SITE_URL}/dashboard`, rulesLink: `${SITE_URL}/rules`,
        }),
      });
      entry.sent = r.sent;
      if (r.sent) {
        // zapsat, na který termín upozornění odešlo (další upozornění až k novému termínu)
        await supabase.from("challenge_accounts").update({ phase_expiry_warned_for: new Date(deadline).toISOString() }).eq("id", a.id);
      } else {
        console.error("phase-expiry warning e-mail selhal:", a.id, r.error);
      }
    }
    const phaseClosed: { who: string; phase: number; deadline: string; overdueDays: number }[] = [];
    for (const acc of expiredAccounts) {
      const deadline = phaseDeadlineMs(acc)!;
      phaseClosed.push({
        who: mask(acc.email), phase: acc.phase,
        deadline: new Date(deadline).toISOString().slice(0, 10),
        overdueDays: Math.floor((now - deadline) / 86400000),
      });
      if (!enforce) continue;
      const reason = expiryReason(acc);
      const { error: closeError } = await supabase
        .from("challenge_accounts")
        // .eq("state","active"): hráč mezitím mohl splnit cíl (pending_approval) — to nepřepisovat
        .update({ state: "breached", breach_reason: reason, synced_at: new Date().toISOString() })
        .eq("id", acc.id)
        .eq("state", "active");
      if (closeError) { console.error("phase-expiry close selhalo:", acc.id, closeError); continue; }
      if (acc.email) {
        const pkg = packageByKey(String(acc.package_key ?? ""));
        sendEmail({
          to: String(acc.email),
          subject: "Your Fundly account was closed",
          html: accountClosedHtml(pkg.name, reason, `${SITE_URL}/dashboard`, resetPrice(pkg)),
        }).then((r) => { if (!r.sent) console.error("account-closed e-mail selhal:", r.error); })
          .catch((e) => console.error("account-closed e-mail error:", e));
      }
    }

    for (const acc of accounts ?? []) {
      const since = acc.last_ticket_at ?? acc.funded_at ?? acc.created_at;
      if (!since) continue;
      const idleDays = (now - new Date(since).getTime()) / 86400000;

      if (idleDays >= BURN_DAYS) {
        const reason = `Inactive for ${BURN_DAYS}+ days`;
        await supabase
          .from("challenge_accounts")
          .update({ state: "breached", breach_reason: reason })
          .eq("id", acc.id);
        burned++;
        if (acc.email) {
          const pkg = packageByKey(String(acc.package_key ?? ""));
          sendEmail({
            to: String(acc.email),
            subject: "Your Fundly account was closed",
            html: accountClosedHtml(pkg.name, reason, `${SITE_URL}/dashboard`, resetPrice(pkg)),
          }).then((r) => { if (!r.sent) console.error("account-closed e-mail selhal:", r.error); })
            .catch((e) => console.error("account-closed e-mail error:", e));
        }
      } else if (idleDays >= WARN_2_DAYS && !acc.inactivity_warned_13) {
        await supabase
          .from("challenge_accounts")
          .update({ inactivity_warned_13: true })
          .eq("id", acc.id);
        warned13++;
      } else if (idleDays >= WARN_1_DAYS && !acc.inactivity_warned_7) {
        await supabase
          .from("challenge_accounts")
          .update({ inactivity_warned_7: true })
          .eq("id", acc.id);
        warned7++;
      }
    }

    return jsonResponse({
      ok: true, checked: accounts?.length ?? 0, warned7, warned13, burned,
      phase_expiry: {
        mode: enforce ? "enforced" : "dry_run", checked: phaseAccounts?.length ?? 0,
        count: phaseClosed.length, accounts: phaseClosed,
        warnings,
      },
    });
  } catch (err) {
    console.error("account-maintenance error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Maintenance run failed." },
      500,
    );
  }
});
