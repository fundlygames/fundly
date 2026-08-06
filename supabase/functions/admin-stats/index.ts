// admin-stats — agregace pro admin.html (tržby, platby, účty, payouty, Meta spend).
// Pouze POST, chráněno sdíleným tajemstvím x-admin-key (env ADMIN_API_KEY).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { isValidAdminKey } from "../_shared/admin.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!(await isValidAdminKey(req))) {
    return jsonResponse({ error: "Neplatný admin klíč." }, 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const monthStartIso = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();
    const monthStartDate = monthStartIso.slice(0, 10);

    const [
      monthPayments,
      allPayments,
      recentPayments,
      accounts,
      recentAccounts,
      recentPayouts,
      metaSpend,
    ] = await Promise.all([
      supabase
        .from("payments")
        .select("amount, currency")
        .eq("status", "succeeded")
        .gte("created_at", monthStartIso),
      supabase.from("payments").select("email, amount, currency").eq("status", "succeeded"),
      supabase
        .from("payments")
        .select("whop_payment_id, email, package_key, amount, currency, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("challenge_accounts").select("state"),
      supabase
        .from("challenge_accounts")
        .select("id, email, package_key, phase, capital, state, kyc_status, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("payouts")
        .select("id, account_id, amount, status, method, whop_transfer_id, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("ad_spend")
        .select("amount_czk")
        .eq("channel", "meta")
        .gte("date", monthStartDate),
    ]);

    // deno-lint-ignore no-explicit-any
    const sum = (rows: any[] | null, field: string) =>
      (rows ?? []).reduce((a, r) => a + (Number(r[field]) || 0), 0);

    // Převod do Kč pro agregace — EUR a USD platby kurzem z env (default 25).
    const EUR_CZK = Number(Deno.env.get("EUR_CZK_RATE") ?? 25) || 25;
    const USD_CZK = Number(Deno.env.get("USD_CZK_RATE") ?? 25) || 25;
    // deno-lint-ignore no-explicit-any
    const toCzk = (r: any) =>
      (Number(r.amount) || 0) *
      (r.currency === "eur" ? EUR_CZK : r.currency === "usd" ? USD_CZK : 1);
    // deno-lint-ignore no-explicit-any
    const sumCzk = (rows: any[] | null) =>
      (rows ?? []).reduce((a, r) => a + toCzk(r), 0);

    const accountsByState: Record<string, number> = {};
    for (const row of accounts.data ?? []) {
      const state = row.state ?? "unknown";
      accountsByState[state] = (accountsByState[state] ?? 0) + 1;
    }

    // Obohacení výplat o údaje žadatele: e-mail, balíček, kapitál + celková
    // útrata (součet jeho zaplacených plateb přepočtený na Kč).
    // deno-lint-ignore no-explicit-any
    const accountById: Record<string, any> = {};
    for (const a of recentAccounts.data ?? []) accountById[a.id] = a;
    const spentByEmail: Record<string, number> = {};
    for (const p of allPayments.data ?? []) {
      const amt = toCzk(p);
      if (p.email) spentByEmail[p.email] = (spentByEmail[p.email] ?? 0) + amt;
    }
    // deno-lint-ignore no-explicit-any
    const enrichedPayouts = (recentPayouts.data ?? []).map((p: any) => {
      const acc = accountById[p.account_id];
      return {
        ...p,
        email: acc?.email ?? null,
        package_key: acc?.package_key ?? null,
        capital: acc?.capital ?? null,
        totalSpentCzk: Math.round(spentByEmail[acc?.email] ?? 0),
      };
    });

    return jsonResponse({
      monthRevenue: Math.round(sumCzk(monthPayments.data)),
      monthCount: (monthPayments.data ?? []).length,
      totalRevenue: Math.round(sumCzk(allPayments.data)),
      recentPayments: recentPayments.data ?? [],
      accountsByState,
      recentAccounts: (recentAccounts.data ?? []).map((a) => ({
        ...a,
        totalSpentCzk: Math.round(spentByEmail[a.email] ?? 0),
      })),
      recentPayouts: enrichedPayouts,
      metaAdsSpendCzk: sum(metaSpend.data, "amount_czk"),
    });
  } catch (err) {
    console.error("admin-stats error:", err);
    return jsonResponse({ error: "Statistiky se nepodařilo načíst." }, 500);
  }
});
