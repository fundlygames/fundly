// restore-account — vrátí plný snapshot portfolia + všechny tikety pro
// obnovu lokálního stavu, když klientovi zmizí localStorage (Safari ITP,
// soukromé okno, jiné zařízení/prohlížeč). Bez tohohle se reálný placený
// účet tiše resetoval na čerstvý kapitál (js/dashboard.js volalo
// Portfolio.init() pokaždé, když Portfolio.get() vrátilo null).
// POST + Authorization: Bearer <user access token>, žádné tělo.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

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
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return jsonResponse({ error: "Invalid access token." }, 401);

    const { data: account } = await supabase
      .from("challenge_accounts")
      .select(`
        id, package_key, phase, state, phase_balance, profit, capital,
        hwm, phase_baseline, phase_started_at, day_start_date, day_start_balance,
        last_payout_at, qualifying_tickets, synced_at, created_at
      `)
      .eq("user_id", user.id)
      .in("state", ["active", "funded"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!account) return jsonResponse({ ok: true, account: null, tickets: [] });

    // bez alespoň jednoho dřívějšího syncu nemá smysl obnovovat — klient
    // ať radši založí čerstvý účet (init()) přesně podle zaplaceného balíčku
    if (!account.synced_at) return jsonResponse({ ok: true, account: null, tickets: [] });

    const { data: tickets } = await supabase
      .from("tickets")
      .select("client_ticket_id, selections, stake, combined_odds, status, placed_at, settled_at, payout")
      .eq("account_id", account.id)
      .order("placed_at", { ascending: false })
      .limit(500);

    return jsonResponse({ ok: true, account, tickets: tickets ?? [] });
  } catch (err) {
    console.error("restore-account error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Restore failed." },
      500,
    );
  }
});
