// meta-ads-spend — stáhne měsíční spend z Meta Marketing API a uloží do ad_spend.
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
// Env: META_ACCESS_TOKEN, META_AD_ACCOUNT_ID (act_...), META_CURRENCY_RATE (volitelný,
// násobitel do CZK — pokud je Meta účet v CZK, nechejte výchozí 1).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const token = Deno.env.get("META_ACCESS_TOKEN");
    const accountId = Deno.env.get("META_AD_ACCOUNT_ID");

    // Bez Meta přístupů funkci tiše přeskočíme (spend lze zadat ručně přes SQL).
    if (!token || !accountId) {
      return jsonResponse({ skipped: true });
    }

    const url =
      `https://graph.facebook.com/v21.0/${accountId}/insights` +
      `?fields=spend&date_preset=this_month&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message ?? `Meta API HTTP ${res.status}`);
    }

    const spendNative = Number(data?.data?.[0]?.spend ?? 0);
    const rate = Number(Deno.env.get("META_CURRENCY_RATE") ?? "1") || 1;
    const amountCzk = Math.round(spendNative * rate * 100) / 100;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from("ad_spend").upsert(
      {
        date: today,
        channel: "meta",
        amount_czk: amountCzk,
        source: "meta_api",
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
