// account-maintenance — denní údržba účtů (cron, viz docs/WHOP-SETUP.md).
// Pravidlo neaktivity: min. 1 tiket / 14 dní na funded účtu.
//   den 7  bez tiketu  → inactivity_warned_7  (banner v dashboardu)
//   den 13 bez tiketu  → inactivity_warned_13 (poslední upozornění)
//   den 14 bez tiketu  → účet se spálí (state → breached, funded status zrušen)
// Bez vlastního SMTP zatím jen banner v appce (viz syncChallengeAccount
// v js/dashboard.js) — e-mailové upozornění doplníme, až poběží support/SMTP.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { isValidAdminKey } from "../_shared/admin.ts";

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
      .select("id, funded_at, last_ticket_at, inactivity_warned_7, inactivity_warned_13, created_at")
      .eq("state", "funded");
    if (error) throw error;

    const now = Date.now();
    let warned7 = 0, warned13 = 0, burned = 0;

    for (const acc of accounts ?? []) {
      const since = acc.last_ticket_at ?? acc.funded_at ?? acc.created_at;
      if (!since) continue;
      const idleDays = (now - new Date(since).getTime()) / 86400000;

      if (idleDays >= BURN_DAYS) {
        await supabase
          .from("challenge_accounts")
          .update({ state: "breached", breach_reason: `Inactive for ${BURN_DAYS}+ days` })
          .eq("id", acc.id);
        burned++;
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

    return jsonResponse({ ok: true, checked: accounts?.length ?? 0, warned7, warned13, burned });
  } catch (err) {
    console.error("account-maintenance error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Maintenance run failed." },
      500,
    );
  }
});
