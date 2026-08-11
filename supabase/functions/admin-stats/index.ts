// admin-stats — agregace pro admin.html (tržby, platby, účty, payouty, Meta spend).
// Pouze POST, chráněno sdíleným tajemstvím x-admin-key (env ADMIN_API_KEY).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { isAdminRequest } from "../_shared/admin.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!(await isAdminRequest(req))) {
    return jsonResponse({ error: "Nemáte oprávnění." }, 401);
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
      affiliateCodes,
      promoPayments,
      promoConversions,
      problemAccounts,
    ] = await Promise.all([
      supabase
        .from("payments")
        .select("amount, currency")
        .eq("status", "succeeded")
        .gte("created_at", monthStartIso),
      supabase.from("payments").select("email, amount, currency, created_at").eq("status", "succeeded"),
      supabase
        .from("payments")
        .select("whop_payment_id, email, package_key, amount, currency, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("challenge_accounts").select("state, email, created_at"),
      supabase
        .from("challenge_accounts")
        .select("id, email, package_key, phase, capital, state, kyc_status, phase_balance, profit, qualifying_tickets, breach_reason, flags, tickets_total, tickets_won, synced_at, betting_profile, risk_score, risk_reasons, watch_status, created_at")
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
      // affiliate: kódy + počty použití a poslední konverze přes promo kód
      supabase
        .from("affiliate_codes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("payments")
        .select("promo_code, amount, currency")
        .eq("status", "succeeded")
        .not("promo_code", "is", null),
      supabase
        .from("payments")
        .select("whop_payment_id, email, package_key, amount, currency, promo_code, affiliate, created_at")
        .eq("status", "succeeded")
        .not("promo_code", "is", null)
        .order("created_at", { ascending: false })
        .limit(50),
      // Problémy: VŠECHNY účty s watch/hold, ne jen posledních 50 registrací —
      // starší rizikový účet by jinak z přehledu vypadl.
      supabase
        .from("challenge_accounts")
        .select("id, email, package_key, phase, state, risk_score, risk_reasons, watch_status, created_at")
        .neq("watch_status", "clear")
        .order("risk_score", { ascending: false })
        .limit(200),
    ]);

    // deno-lint-ignore no-explicit-any
    const sum = (rows: any[] | null, field: string) =>
      (rows ?? []).reduce((a, r) => a + (Number(r[field]) || 0), 0);

    // Účty se kupují v USD — admin ukazuje všechno v USD. Staré platby v EUR/CZK
    // (z doby před přechodem na USD) se přepočtou kurzem z env, ať nezkreslí součty.
    const EUR_USD = Number(Deno.env.get("EUR_USD_RATE") ?? 1.08) || 1.08;
    const CZK_USD = Number(Deno.env.get("CZK_USD_RATE") ?? 0.044) || 0.044;
    // deno-lint-ignore no-explicit-any
    const toUsd = (r: any) =>
      (Number(r.amount) || 0) *
      (r.currency === "eur" ? EUR_USD : r.currency === "czk" ? CZK_USD : 1);
    // deno-lint-ignore no-explicit-any
    const sumUsd = (rows: any[] | null) =>
      (rows ?? []).reduce((a, r) => a + toUsd(r), 0);

    const accountsByState: Record<string, number> = {};
    for (const row of accounts.data ?? []) {
      const state = row.state ?? "unknown";
      accountsByState[state] = (accountsByState[state] ?? 0) + 1;
    }

    // Obohacení výplat o údaje žadatele: e-mail, balíček, kapitál + celková
    // útrata (součet jeho zaplacených plateb přepočtený na USD).
    // deno-lint-ignore no-explicit-any
    const accountById: Record<string, any> = {};
    for (const a of recentAccounts.data ?? []) accountById[a.id] = a;
    const spentByEmail: Record<string, number> = {};
    for (const p of allPayments.data ?? []) {
      const amt = toUsd(p);
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
        totalSpentUsd: Math.round(spentByEmail[acc?.email] ?? 0),
      };
    });

    // E-maily zákazníků pro admin (distinct z účtů + zaplacených plateb,
    // s počty a datem poslední aktivity).
    // deno-lint-ignore no-explicit-any
    const emailMap: Record<string, any> = {};
    for (const a of accounts.data ?? []) {
      if (!a.email) continue;
      const e = emailMap[a.email] ??= { email: a.email, accounts: 0, payments: 0, lastAt: null };
      e.accounts++;
    }
    for (const p of allPayments.data ?? []) {
      if (!p.email) continue;
      const e = emailMap[p.email] ??= { email: p.email, accounts: 0, payments: 0, lastAt: null };
      e.payments++;
      if (!e.lastAt || String(p.created_at) > e.lastAt) e.lastAt = p.created_at;
    }
    const emailsList = Object.values(emailMap)
      .sort((a, b) => String(b.lastAt ?? "").localeCompare(String(a.lastAt ?? "")));

    // Registrace po dnech (posledních 8 dní) — reálná data z challenge_accounts.
    const dayBuckets: { label: string; value: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      dayBuckets.push({
        label: d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" }),
        value: 0,
      });
    }
    const bucketKey = (t: string) =>
      new Date(t).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
    const byLabel: Record<string, number> = {};
    for (const a of accounts.data ?? []) {
      if (!a.created_at) continue;
      const k = bucketKey(a.created_at);
      if (k in byLabel || dayBuckets.some((b) => b.label === k)) {
        byLabel[k] = (byLabel[k] ?? 0) + 1;
      }
    }
    dayBuckets.forEach((b) => { b.value = byLabel[b.label] ?? 0; });

    // Tržby po týdnech (posledních 8 týdnů, v USD) — nahrazuje mock graf v adminu.
    const revenueWeeks: { label: string; value: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      revenueWeeks.push({ label: i === 0 ? "This week" : `-${i}w`, value: 0 });
    }
    for (const p of allPayments.data ?? []) {
      if (!p.created_at) continue;
      const ageDays = (Date.now() - new Date(p.created_at).getTime()) / 86400000;
      const weekIndex = 7 - Math.min(7, Math.floor(ageDays / 7));
      if (weekIndex < 0 || weekIndex > 7) continue;
      revenueWeeks[weekIndex].value += toUsd(p);
    }
    revenueWeeks.forEach((w) => { w.value = Math.round(w.value); });

    // Poslední aktivita backendu (pro diagnostiku)
    const lastPaymentAt = recentPayments.data?.[0]?.created_at ?? null;
    const lastSyncAt = (recentAccounts.data ?? []).reduce(
      // deno-lint-ignore no-explicit-any
      (max: string | null, a: any) =>
        a.synced_at && (!max || a.synced_at > max) ? a.synced_at : max,
      null,
    );

    // Agregovaná sázková analytika přes účty (top sporty a ligy)
    const sportCount: Record<string, number> = {};
    const leagueCount: Record<string, number> = {};
    for (const a of recentAccounts.data ?? []) {
      // deno-lint-ignore no-explicit-any
      const bp: any = a.betting_profile;
      if (!bp) continue;
      for (const s of bp.topSports ?? []) {
        sportCount[s.name] = (sportCount[s.name] ?? 0) + (Number(s.count) || 0);
      }
      for (const l of bp.topLeagues ?? []) {
        leagueCount[l.name] = (leagueCount[l.name] ?? 0) + (Number(l.count) || 0);
      }
    }
    const topEntries = (m: Record<string, number>) =>
      Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([name, count]) => ({ name, count }));
    const bettingAnalytics = {
      sports: topEntries(sportCount),
      leagues: topEntries(leagueCount),
    };

    // počty použití + tržby přes affiliate kódy z úspěšných plateb (case-insensitive)
    const usedByCode: Record<string, number> = {};
    let affiliateRevenueUsd = 0;
    // deno-lint-ignore no-explicit-any
    for (const p of promoPayments.data ?? []) {
      const key = String(p.promo_code).toUpperCase();
      usedByCode[key] = (usedByCode[key] ?? 0) + 1;
      affiliateRevenueUsd += toUsd(p);
    }

    // Meta ads spend je uložený v CZK (starší sloupec ad_spend.amount_czk) — pro
    // konzistentní USD zobrazení v adminu ho převádíme stejným kurzem jako platby.
    const metaAdsSpendUsd = sum(metaSpend.data, "amount_czk") * CZK_USD;

    // Marketingové kanály — jen to, co skutečně měříme. Google/Organic/Influenceři
    // zatím nemají UTM tracking na checkoutu, proto se NEVYMÝŠLEJÍ čísla, jen se
    // označí jako "not tracked" (žádné tiché nahrazení mockem).
    const marketingChannels = [
      { channel: "Meta Ads", spendUsd: Math.round(metaAdsSpendUsd), signups: null, tracked: true },
      { channel: "Affiliate / promo codes", spendUsd: 0, revenueUsd: Math.round(affiliateRevenueUsd), signups: (promoPayments.data ?? []).length, tracked: true },
      { channel: "Google Ads", tracked: false },
      { channel: "Organic / SEO", tracked: false },
      { channel: "Influencers", tracked: false },
    ];

    return jsonResponse({
      monthRevenue: Math.round(sumUsd(monthPayments.data)),
      monthCount: (monthPayments.data ?? []).length,
      totalRevenue: Math.round(sumUsd(allPayments.data)),
      revenueByWeek: revenueWeeks,
      recentPayments: recentPayments.data ?? [],
      accountsByState,
      breachedCount: accountsByState.breached ?? 0,
      // rizikové účty (skóre >= 30, tj. watch nebo hold) pro admin přehled
      // deno-lint-ignore no-explicit-any
      riskyCount: (recentAccounts.data ?? []).filter((a: any) => (a.risk_score ?? 0) >= 30).length,
      recentAccounts: (recentAccounts.data ?? []).map((a) => ({
        ...a,
        totalSpentUsd: Math.round(spentByEmail[a.email] ?? 0),
      })),
      // Problémy: všechny watch/hold účty (ne jen z posledních 50 registrací)
      problemAccounts: problemAccounts.data ?? [],
      recentPayouts: enrichedPayouts,
      emailsList,
      signupsByDay: dayBuckets,
      lastPaymentAt,
      lastSyncAt,
      bettingAnalytics,
      marketingChannels,
      metaAdsSpendUsd: Math.round(metaAdsSpendUsd),
      // deno-lint-ignore no-explicit-any
      affiliateCodes: (affiliateCodes.data ?? []).map((c: any) => ({
        ...c,
        used: usedByCode[String(c.code).toUpperCase()] ?? 0,
      })),
      promoConversions: promoConversions.data ?? [],
    });
  } catch (err) {
    console.error("admin-stats error:", err);
    return jsonResponse({ error: "Statistiky se nepodařilo načíst." }, 500);
  }
});
