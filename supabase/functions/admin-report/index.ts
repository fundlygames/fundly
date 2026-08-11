// admin-report — Reporty sekce v adminu: libovolný datumový rozsah + historie
// automatických měsíčních reportů.
// POST { action: "range", from, to } | { action: "history" } | { action: "monthly-run" }
// "monthly-run" volá denní cron (jen 1. dne v měsíci fakticky něco zapíše —
// viz podmínka níže) a spočítá PŘEDCHOZÍ kalendářní měsíc.
// Chráněno x-admin-key.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { isAdminRequest } from "../_shared/admin.ts";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const EUR_USD = Number(Deno.env.get("EUR_USD_RATE") ?? 1.08) || 1.08;
    const CZK_USD = Number(Deno.env.get("CZK_USD_RATE") ?? 0.044) || 0.044;
    // deno-lint-ignore no-explicit-any
    const toUsd = (r: any) =>
      (Number(r.amount) || 0) * (r.currency === "eur" ? EUR_USD : r.currency === "czk" ? CZK_USD : 1);

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "history") {
      const { data, error } = await supabase
        .from("monthly_reports")
        .select("*")
        .order("month_start", { ascending: false })
        .limit(24);
      if (error) throw error;
      return jsonResponse({ ok: true, reports: data ?? [] });
    }

    if (action === "monthly-run") {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const monthStartStr = monthStart.toISOString().slice(0, 10);

      const [payments, payouts, accounts] = await Promise.all([
        supabase.from("payments").select("amount, currency").eq("status", "succeeded")
          .gte("created_at", monthStart.toISOString()).lt("created_at", monthEnd.toISOString()),
        supabase.from("payouts").select("amount").in("status", ["paid", "sent"])
          .gte("created_at", monthStart.toISOString()).lt("created_at", monthEnd.toISOString()),
        supabase.from("challenge_accounts").select("id", { count: "exact", head: true })
          .gte("created_at", monthStart.toISOString()).lt("created_at", monthEnd.toISOString()),
      ]);

      const revenueUsd = (payments.data ?? []).reduce((a, p) => a + toUsd(p), 0);
      const payoutsUsd = (payouts.data ?? []).reduce((a, p) => a + (Number(p.amount) || 0), 0);

      const { error: upsertError } = await supabase.from("monthly_reports").upsert({
        month_start: monthStartStr,
        revenue_usd: Math.round(revenueUsd),
        payments_count: (payments.data ?? []).length,
        payouts_usd: Math.round(payoutsUsd),
        new_accounts: accounts.count ?? 0,
      }, { onConflict: "month_start" });
      if (upsertError) throw upsertError;

      return jsonResponse({ ok: true, monthStart: monthStartStr });
    }

    // action === "range" (default)
    const from = String(body.from ?? "");
    const to = String(body.to ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return jsonResponse({ error: "Provide a valid from/to date (YYYY-MM-DD)." }, 400);
    }
    const fromIso = new Date(`${from}T00:00:00Z`).toISOString();
    const toIso = new Date(`${to}T23:59:59.999Z`).toISOString();

    const [payments, payouts, accounts] = await Promise.all([
      supabase.from("payments").select("amount, currency, package_key, status")
        .eq("status", "succeeded").gte("created_at", fromIso).lte("created_at", toIso),
      supabase.from("payouts").select("amount, status")
        .in("status", ["paid", "sent"]).gte("created_at", fromIso).lte("created_at", toIso),
      supabase.from("challenge_accounts").select("id", { count: "exact", head: true })
        .gte("created_at", fromIso).lte("created_at", toIso),
    ]);

    const byPackage: Record<string, { count: number; revenueUsd: number }> = {};
    let revenueUsd = 0;
    for (const p of payments.data ?? []) {
      const amt = toUsd(p);
      revenueUsd += amt;
      const key = p.package_key || "other";
      byPackage[key] ??= { count: 0, revenueUsd: 0 };
      byPackage[key].count++;
      byPackage[key].revenueUsd += amt;
    }
    const payoutsUsd = (payouts.data ?? []).reduce((a, p) => a + (Number(p.amount) || 0), 0);

    return jsonResponse({
      ok: true,
      from, to,
      revenueUsd: Math.round(revenueUsd),
      paymentsCount: (payments.data ?? []).length,
      payoutsUsd: Math.round(payoutsUsd),
      newAccounts: accounts.count ?? 0,
      byPackage: Object.entries(byPackage).map(([key, v]) => ({
        packageKey: key, count: v.count, revenueUsd: Math.round(v.revenueUsd),
      })),
    });
  } catch (err) {
    console.error("admin-report error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Report failed." },
      500,
    );
  }
});
