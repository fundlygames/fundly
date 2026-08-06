// meta-ads-spend — stáhne měsíční Meta spend z Whop Ads reportu a uloží do ad_spend.
// Whop má nativní Meta integraci (dashboard → Ads → připojení Meta ad účtu),
// takže Meta token nepotřebujeme — čteme přes Whop API (GET /ad_reports).
//
// Plánování (denní běh): Supabase dashboard → Database → Cron (pg_cron + pg_net):
//
//   select cron.schedule('meta-ads-spend-daily', '0 6 * * *', $$
//     select net.http_post(
//       url := 'https://<PROJECT_REF>.supabase.co/functions/v1/meta-ads-spend',
//       headers := '{"Content-Type":"application/json"}'::jsonb,
//       body := '{}'::jsonb
//     );
//   $$);
//
// Env: WHOP_API_KEY, WHOP_COMPANY_ID (sdílené s ostatními funkcemi).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { whopFetch } from "../_shared/whop.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const companyId = Deno.env.get("WHOP_COMPANY_ID");
    if (!companyId || !Deno.env.get("WHOP_API_KEY")) {
      return jsonResponse({ skipped: true });
    }

    // report za aktuální měsíc, spend rovnou v CZK
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const report = await whopFetch(
      `/ad_reports?company_id=${companyId}` +
        `&from=${encodeURIComponent(from)}&to=${encodeURIComponent(now.toISOString())}` +
        `&currency=czk`,
    );

    const amountCzk = Math.round(Number(report?.summary?.spend ?? 0) * 100) / 100;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = now.toISOString().slice(0, 10);
    const { error } = await supabase.from("ad_spend").upsert(
      {
        date: today,
        channel: "meta",
        amount_czk: amountCzk,
        source: "whop_ad_reports",
      },
      { onConflict: "date,channel" },
    );
    if (error) throw error;

    return jsonResponse({ ok: true, date: today, amountCzk });
  } catch (err) {
    console.error("meta-ads-spend error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Meta spend se nepodařilo načíst." },
      500,
    );
  }
});
