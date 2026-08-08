// sync-account — snapshot stavu portfolia z hráčského dashboardu (js/dashboard.js).
// POST + Authorization: Bearer <user access token> (JWT ověřujeme sami přes
// auth server, v config.toml je verify_jwt = false).
// Body: { phase, state, balance, profit, qualifyingTickets, breachReason,
//         flags, ticketsTotal, ticketsWon }
// Aktualizuje sync sloupce nejnovějšího challenge účtu uživatele + state
// (active→funded / active→breached dle snapshotu; breached se nikdy nevrací).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const ALLOWED_STATES = ["active", "funded", "breached"];

function saneNumber(v: unknown, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) > max) return null;
  return n;
}

function saneInt(v: unknown, max: number): number | null {
  const n = saneNumber(v, max);
  if (n === null || !Number.isInteger(n) || n < 0) return null;
  return n;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return jsonResponse({ error: "Missing access token." }, 401);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ověření uživatelského JWT proti auth serveru
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) {
      return jsonResponse({ error: "Invalid access token." }, 401);
    }

    const body = await req.json().catch(() => ({}));

    // ---------- validace snapshotu ----------
    const phase = saneInt(body.phase, 3);
    if (phase === null || phase < 1) {
      return jsonResponse({ error: "Invalid phase (1–3)." }, 400);
    }
    const state = String(body.state ?? "");
    if (!ALLOWED_STATES.includes(state)) {
      return jsonResponse({ error: "Invalid state." }, 400);
    }
    const balance = saneNumber(body.balance, 1e8);
    const profit = saneNumber(body.profit, 1e8);
    const qualifyingTickets = saneInt(body.qualifyingTickets ?? 0, 1e6);
    const ticketsTotal = saneInt(body.ticketsTotal ?? 0, 1e6);
    const ticketsWon = saneInt(body.ticketsWon ?? 0, 1e6);
    if ([balance, profit, qualifyingTickets, ticketsTotal, ticketsWon].includes(null)) {
      return jsonResponse({ error: "Invalid numbers in snapshot." }, 400);
    }
    const breachReason = body.breachReason == null
      ? null
      : String(body.breachReason).slice(0, 200);

    // rizikové skóre z klienta (pravidelné, 0–100 + krátké důvody)
    const riskScore = body.riskScore == null ? null : saneInt(body.riskScore, 100);
    if (body.riskScore != null && riskScore === null) {
      return jsonResponse({ error: "Invalid riskScore (0–100)." }, 400);
    }
    const riskReasons = Array.isArray(body.riskReasons)
      ? body.riskReasons
          .filter((r: unknown) => typeof r === "string" && (r as string).length <= 100)
          .slice(0, 10)
      : [];
    const flags = Array.isArray(body.flags)
      ? body.flags
          .filter((f: unknown) => typeof f === "string" && (f as string).length <= 40)
          .slice(0, 10)
      : [];

    // sázkový profil: top sporty/ligy + průměry (kompaktní jsonb)
    // deno-lint-ignore no-explicit-any
    const saneTop = (list: any) =>
      Array.isArray(list)
        ? list
            .filter((x: unknown) =>
              x && typeof x.name === "string" && Number.isInteger(Number(x.count)))
            .slice(0, 5)
            .map((x: { name: string; count: number }) => ({
              name: String(x.name).slice(0, 80),
              count: Math.min(Number(x.count), 1e6),
            }))
        : [];
    const bp = body.bettingProfile;
    const bettingProfile = bp && typeof bp === "object"
      ? {
          topSports: saneTop(bp.topSports),
          topLeagues: saneTop(bp.topLeagues),
          avgStake: saneNumber(bp.avgStake ?? 0, 1e8) ?? 0,
          avgOdds: saneNumber(bp.avgOdds ?? 0, 1e4) ?? 0,
        }
      : null;

    // challenge účet přihlášeného hráče (nejnovější)
    const { data: account } = await supabase
      .from("challenge_accounts")
      .select("id, state")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!account) {
      return jsonResponse({ error: "You have no challenge account." }, 400);
    }

    // breached je terminální — klient ho nesmí přepsat zpět na active/funded
    const nextState = account.state === "breached" ? "breached" : state;

    const { error: updateError } = await supabase
      .from("challenge_accounts")
      .update({
        state: nextState,
        phase,
        phase_balance: balance,
        profit,
        qualifying_tickets: qualifyingTickets,
        breach_reason: nextState === "breached" ? breachReason : null,
        flags,
        tickets_total: ticketsTotal,
        tickets_won: ticketsWon,
        synced_at: new Date().toISOString(),
        ...(bettingProfile ? { betting_profile: bettingProfile } : {}),
        ...(riskScore !== null ? { risk_score: riskScore, risk_reasons: riskReasons } : {}),
      })
      .eq("id", account.id);
    if (updateError) throw updateError;

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("sync-account error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Sync failed." },
      500,
    );
  }
});
