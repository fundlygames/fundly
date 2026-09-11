// approve-phase — admin schválení/zamítnutí přechodu do další fáze
// (Phase 1 → Phase 2 → Funded). Hráč, který splní cíl fáze, už neprojde
// automaticky — dashboard.js/portfolio.js ho zastaví ve stavu
// "pending_approval" (state = pending_approval, pending_phase = 2 nebo 3)
// a čeká, dokud admin nezavolá tuhle funkci. Chráněno stejně jako ostatní
// admin funkce (x-admin-key nebo JWT admina, viz _shared/admin.ts).
//
// POST { accountId, action: "approve" | "reject", note? }
//
// approve: fáze se posune na pending_phase, účet se resetuje na "fresh start"
// dané fáze (baseline/den = aktuální zůstatek, jako by fáze právě začala,
// kvalifikační tikety na 0) a odešle se e-mail (phase1PassedHtml / fundedHtml).
// reject: účet se odemkne zpět na active se STEJNOU fází/baseline (hráč může
// dál hrát a znovu se kvalifikovat) — pending_phase se vymaže, důvod (note)
// se uloží pro pozdější dohledání v admin sekci.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { isAdminRequest } from "../_shared/admin.ts";
import { sendEmail, phase1PassedHtml, fundedHtml } from "../_shared/email.ts";
import { packageByKey } from "../_shared/packages.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://fundly.games";
// stejná konstanta jako packageMeta().profitSplit v js/packages.js (fixní,
// nezávisí na balíčku) — server-side rules meta pro tenhle jeden účel zatím
// nemá vlastní modul, viz poznámka v packages.ts.
const PROFIT_SPLIT = 80;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!(await isAdminRequest(req))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.accountId ?? "");
    const action = String(body.action ?? "");
    const note = body.note == null ? null : String(body.note).slice(0, 500);
    if (!accountId) return jsonResponse({ error: "Missing accountId." }, 400);
    if (action !== "approve" && action !== "reject") {
      return jsonResponse({ error: "action must be 'approve' or 'reject'." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: account, error: fetchError } = await supabase
      .from("challenge_accounts")
      .select("id, email, package_key, state, phase, pending_phase, phase_balance, phase1_completed_at, phase2_completed_at, funded_at, kyc_status")
      .eq("id", accountId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!account) return jsonResponse({ error: "Account not found." }, 404);
    if (account.state !== "pending_approval" || !account.pending_phase) {
      return jsonResponse({ error: "This account has no pending phase transition." }, 400);
    }

    // Fáze 3 (Funded) vyžaduje dokončené KYC/AML ověření (terms.html §5.1)
    // před uzavřením Independent Contractor Agreement — bez toho hráč
    // stejně nikdy nedostane vyplaceno (viz whop-payout), ale schválit
    // přechod do Funded bez dokončeného KYC by odporovalo podmínkám, proto
    // se to kontroluje už tady, ne až u samotné výplaty.
    if (action === "approve" && account.pending_phase === 3 && account.kyc_status !== "verified") {
      return jsonResponse(
        { error: "Player has not completed KYC verification via Whop yet — required before approving Phase 3 (Funded)." },
        400,
      );
    }

    const now = new Date().toISOString();
    const pkg = packageByKey(String(account.package_key ?? ""));

    if (action === "reject") {
      const { error: updateError } = await supabase
        .from("challenge_accounts")
        .update({
          state: "active",
          pending_phase: null,
          admin_note: note,
        })
        .eq("id", accountId);
      if (updateError) throw updateError;
      return jsonResponse({ ok: true, action: "reject" });
    }

    // approve — fáze se posune, účet se resetuje na fresh start dané fáze
    const newPhase = account.pending_phase; // 2 nebo 3 (funded)
    const newState = newPhase === 3 ? "funded" : "active";
    const baseline = Number(account.phase_balance) || 0;

    const stamps: Record<string, string> = {};
    if (newPhase === 2 && !account.phase1_completed_at) stamps.phase1_completed_at = now;
    if (newPhase === 3 && !account.phase2_completed_at) stamps.phase2_completed_at = now;
    if (newState === "funded" && !account.funded_at) stamps.funded_at = now;

    const { error: updateError } = await supabase
      .from("challenge_accounts")
      .update({
        phase: newPhase,
        state: newState,
        phase_baseline: baseline,
        phase_started_at: now,
        day_start_date: now.slice(0, 10),
        day_start_balance: baseline,
        qualifying_tickets: 0,
        pending_phase: null,
        admin_note: note,
        ...stamps,
      })
      .eq("id", accountId);
    if (updateError) throw updateError;

    if (account.email && pkg) {
      const dashboardLink = `${SITE_URL}/dashboard`;
      const html = newPhase === 2
        ? phase1PassedHtml(pkg.name, dashboardLink)
        : fundedHtml(pkg.name, PROFIT_SPLIT, dashboardLink);
      const subject = newPhase === 2 ? "Phase 1 passed — you're on Phase 2" : "You're funded!";
      sendEmail({ to: String(account.email), subject, html })
        .then((r) => { if (!r.sent) console.error("phase-passed e-mail selhal:", r.error); })
        .catch((e) => console.error("phase-passed e-mail error:", e));
    }

    return jsonResponse({ ok: true, action: "approve", newPhase, newState });
  } catch (err) {
    console.error("approve-phase error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Approval failed." },
      500,
    );
  }
});
