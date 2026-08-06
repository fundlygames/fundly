// request-payout — žádost hráče o výběr z financovaného účtu (dashboard.html).
// POST { amount, method } + Authorization: Bearer <user access token>
// → { ok, payout } nebo { error } s anglickou hláškou (user-facing).
// JWT ověřujeme sami přes auth server (v config.toml je verify_jwt = false).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const MIN_PAYOUT = 10; // minimální výběr v USD
const MAX_PAYOUT = 4000; // maximální výběr na jednu žádost v USD
// Podíl hráče ze zisku (85 %) — zatím jen informativní, cap se uplatní až s profit sloupcem.

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!token) return jsonResponse({ error: "Please sign in to make a withdrawal." }, 401);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ověření uživatelského JWT proti auth serveru
    const { data: userData, error: userError } = await supabase.auth.getUser(
      token,
    );
    const user = userData?.user;
    if (userError || !user) {
      return jsonResponse({ error: "Please sign in to make a withdrawal." }, 401);
    }

    const { amount, method } = await req.json();
    const payoutAmount = Number(amount);
    if (!Number.isFinite(payoutAmount) || payoutAmount < MIN_PAYOUT) {
      return jsonResponse({ error: `The minimum withdrawal is $${MIN_PAYOUT}.` }, 400);
    }
    if (payoutAmount > MAX_PAYOUT) {
      return jsonResponse({ error: `The maximum withdrawal per request is $${MAX_PAYOUT.toLocaleString("en-US")}.` }, 400);
    }
    if (!method || typeof method !== "string") {
      return jsonResponse({ error: "Choose a payout method." }, 400);
    }

    // challenge účet přihlášeného hráče (nejnovější)
    const { data: account } = await supabase
      .from("challenge_accounts")
      .select("id, state, capital")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!account) {
      return jsonResponse({ error: "You have no challenge account." }, 400);
    }
    if (account.state !== "funded") {
      return jsonResponse(
        { error: "Withdrawals are only available on a funded account." },
        400,
      );
    }

    // Schéma challenge_accounts zatím profit nesleduje — stav portfolia žije
    // zatím na klientovi. Server proto validuje jen min. částku a stav účtu;
    // skutečnou kontrolou je ruční schválení adminem (pending → whop-payout).
    // Až přibyde profit sloupec, vrátit sem cap: amount ≤ 85 % profitu.

    const { data: payout, error: payoutError } = await supabase
      .from("payouts")
      .insert({
        account_id: account.id,
        amount: payoutAmount,
        status: "pending",
        method: String(method).slice(0, 100),
      })
      .select("id, amount, status, method, created_at")
      .single();
    if (payoutError) throw payoutError;

    return jsonResponse({ ok: true, payout });
  } catch (err) {
    console.error("request-payout error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "The request could not be submitted." },
      500,
    );
  }
});
