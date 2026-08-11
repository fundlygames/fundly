// leaderboard-get — top hráči podle profitu/ROI/win rate (jen ti se zapnutým
// sdílením v profilu). Veřejné, ale nikdy neposílá e-mail — jen přezdívku
// nebo anonymní "Player #xxxx" z id.
// POST {} (volitelně Authorization: Bearer <token>, ať víme, který řádek je "já")
// → { rows: [{ id, name, isMe, packageKey, capital, profit, roi, winRate }] }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let myUserId: string | null = null;
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      myUserId = data?.user?.id ?? null;
    }

    const { data: accounts, error } = await supabase
      .from("challenge_accounts")
      .select("id, user_id, nickname, package_key, capital, profit, tickets_total, tickets_won, state")
      .eq("leaderboard_opt_in", true)
      .in("state", ["active", "funded"])
      .not("profit", "is", null)
      .order("profit", { ascending: false })
      .limit(50);
    if (error) throw error;

    const rows = (accounts ?? []).map((a) => {
      const capital = Number(a.capital) || 0;
      const profit = Number(a.profit) || 0;
      const total = Number(a.tickets_total) || 0;
      const won = Number(a.tickets_won) || 0;
      return {
        id: a.id,
        name: a.nickname && String(a.nickname).trim()
          ? String(a.nickname).trim().slice(0, 24)
          : `Player #${String(a.id).slice(0, 4)}`,
        isMe: !!myUserId && a.user_id === myUserId,
        packageKey: a.package_key,
        profit: Math.round(profit),
        roi: capital > 0 ? Math.round((profit / capital) * 1000) / 10 : 0,
        winRate: total > 0 ? Math.round((won / total) * 100) : 0,
      };
    });

    return jsonResponse({ rows });
  } catch (err) {
    console.error("leaderboard-get error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Leaderboard failed to load." },
      500,
    );
  }
});
