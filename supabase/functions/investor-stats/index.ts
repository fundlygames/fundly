// investor-stats — data pro stránku investorů (investors.html). Přístup má jen ten, kdo zná tajný odkaz
// (token z tabulky investor_accounts, vytváří ho admin ve finance-manage). Vrací VÝHRADNĚ agregovaná čísla —
// žádné e-maily, jednotlivé účty ani rizikové údaje.
// POST { k } (nebo GET ?k=) → { investor: { name }, stats, derived }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { fxRates } from "../_shared/fx.ts";

const num = (v: unknown) => Number(v) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b > 0 ? round2((100 * a) / b) : null);
const ratio = (a: number, b: number) => (b > 0 ? round2(a / b) : null);
const change = (now: number, prev: number) => (prev > 0 ? round2((100 * (now - prev)) / prev) : null);

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let token = new URL(req.url).searchParams.get("k") ?? "";
  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    token = String(b.k ?? token);
  } else if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  token = token.trim();
  if (token.length < 24 || token.length > 128) return jsonResponse({ error: "Invalid access link." }, 401);

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: inv } = await supabase
      .from("investor_accounts")
      .select("id, name, active, views")
      .eq("token", token)
      .maybeSingle();
    if (!inv || !inv.active) return jsonResponse({ error: "Invalid or revoked access link." }, 401);

    supabase.from("investor_accounts")
      .update({ last_viewed_at: new Date().toISOString(), views: (inv.views ?? 0) + 1 })
      .eq("id", inv.id).then(() => {}, () => {});

    const fx = fxRates();
    const { data, error } = await supabase.rpc("investor_stats", { p_eur: fx.eur, p_czk: fx.czk, p_gbp: fx.gbp, p_pln: fx.pln });
    if (error) throw error;
    // deno-lint-ignore no-explicit-any
    const s: any = typeof data === "string" ? JSON.parse(data) : data;

    const gross = num(s.revenue.gross);
    const net = num(s.revenue.net_of_fees);
    const costs = num(s.costs.total);
    const payouts = num(s.costs.partner_payouts_paid);
    const marketing = num(s.costs.marketing);
    const customers = num(s.people.customers);
    const netProfit = round2(net - costs - payouts);

    const derived = {
      net_profit: netProfit,
      net_revenue: round2(net),
      processing_fees: round2(gross - net),
      total_outflow: round2(costs + payouts),
      profit_margin_pct: pct(netProfit, gross),
      roas: ratio(gross, marketing),
      cac: ratio(marketing, customers),
      arpu: ratio(gross, customers),
      aov: ratio(gross, num(s.people.purchases)),
      registration_to_customer_pct: pct(customers, num(s.people.registrations_total)),
      visitor_to_registration_pct: pct(num(s.traffic.funnel.registrations), num(s.traffic.funnel.visitors)),
      visitor_to_customer_pct: pct(num(s.traffic.funnel.purchases), num(s.traffic.funnel.visitors)),
      phase2_rate_pct: pct(num(s.people.reached_phase2), num(s.people.players_by_state ? Object.values(s.people.players_by_state as Record<string, number>).reduce((a, b) => a + num(b), 0) : 0)),
      closed_rate_pct: pct(num(s.people.closed_accounts), num(s.people.players_by_state ? Object.values(s.people.players_by_state as Record<string, number>).reduce((a, b) => a + num(b), 0) : 0)),
      registrations_change_pct: change(num(s.people.registrations_30d), num(s.people.registrations_prev_30d)),
      revenue_change_pct: change(num(s.revenue.gross_30d), num(s.revenue.gross_prev_30d)),
      visitors_change_pct: change(num(s.traffic.visitors_30d), num(s.traffic.visitors_prev_30d)),
      tickets_change_pct: change(num(s.activity.tickets_30d), num(s.activity.tickets_prev_30d)),
      repeat_customer_pct: pct(num(s.people.repeat_customers), customers),
    };

    return new Response(JSON.stringify({ investor: { name: inv.name }, stats: s, derived }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("investor-stats:", e);
    return jsonResponse({ error: "Could not load the statistics." }, 500);
  }
});
