// affiliate-stats — self-service statistiky affiliate partnera v dashboard.html.
// POST + Authorization: Bearer <user access token> → kódy vlastněné e-mailem
// přihlášeného uživatele, konverze z payments a aktivita doporučených hráčů
// (tickets_total z challenge_accounts, zobrazení omezené na 5 tiketů).
// E-maily kupujících vracíme zamaskované (ma***@gmail.com).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const MAX_TICKETS_SHOWN = 5; // display cap dle zadání

function maskEmail(email: string): string {
  const [local = "", domain = ""] = String(email).split("@");
  const keep = local.slice(0, 2);
  return `${keep}${"*".repeat(3)}@${domain}`;
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return jsonResponse({ error: "Please sign in." }, 401);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ověření uživatelského JWT proti auth serveru (stejně jako request-payout)
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user?.email) {
      return jsonResponse({ error: "Please sign in." }, 401);
    }

    // kódy vlastněné e-mailem přihlášeného uživatele
    const { data: codes, error: codesError } = await supabase
      .from("affiliate_codes")
      .select("code, plan_key, discount_pct, commission_pct, usage_limit, active, created_at")
      .ilike("owner_email", user.email);
    if (codesError) throw codesError;

    if (!codes || !codes.length) {
      return jsonResponse({ codes: [], referrals: [], totals: { conversions: 0, earnings: 0 } });
    }

    // deno-lint-ignore no-explicit-any
    const codeList: any[] = codes;
    const byUpper: Record<string, (typeof codeList)[number]> = {};
    for (const c of codeList) byUpper[String(c.code).toUpperCase()] = c;

    // úspěšné platby s promo kódem — vlastníkovy kódy dofiltrujeme v JS
    // (case-insensitive; Whop může vracet kód v jiné velikosti písmen)
    const { data: payments, error: payError } = await supabase
      .from("payments")
      .select("email, package_key, amount, currency, promo_code, created_at")
      .eq("status", "succeeded")
      .not("promo_code", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (payError) throw payError;

    // deno-lint-ignore no-explicit-any
    const conversions = (payments ?? []).filter((p: any) =>
      byUpper[String(p.promo_code).toUpperCase()]
    );

    // součet tiketů doporučených hráčů z challenge_accounts (per e-mail kupujícího)
    const buyerEmails = [...new Set(conversions.map((p: { email?: string }) => p.email).filter(Boolean))];
    const ticketsByEmail: Record<string, number> = {};
    if (buyerEmails.length) {
      const { data: accounts } = await supabase
        .from("challenge_accounts")
        .select("email, tickets_total")
        .in("email", buyerEmails);
      // deno-lint-ignore no-explicit-any
      for (const a of accounts ?? []) {
        ticketsByEmail[a.email] = (ticketsByEmail[a.email] ?? 0) + (Number(a.tickets_total) || 0);
      }
    }

    // deno-lint-ignore no-explicit-any
    const codeStats = codeList.map((c: any) => {
      const mine = conversions.filter(
        (p: any) => String(p.promo_code).toUpperCase() === String(c.code).toUpperCase(),
      );
      const revenue = mine.reduce((a: number, p: any) => a + (Number(p.amount) || 0), 0);
      return {
        code: c.code,
        planKey: c.plan_key,
        discountPct: Number(c.discount_pct),
        commissionPct: Number(c.commission_pct),
        usageLimit: c.usage_limit,
        active: c.active,
        used: mine.length,
        revenue,
        earnings: (revenue * Number(c.commission_pct)) / 100,
      };
    });

    const referrals = conversions.map((p: any) => {
      const c = byUpper[String(p.promo_code).toUpperCase()];
      return {
        email: maskEmail(p.email ?? ""),
        packageKey: p.package_key ?? null,
        amount: Number(p.amount) || 0,
        currency: p.currency ?? "usd",
        code: c?.code ?? p.promo_code,
        tickets: Math.min(
          MAX_TICKETS_SHOWN,
          ticketsByEmail[p.email] ?? 0,
        ),
        ticketsCapped: (ticketsByEmail[p.email] ?? 0) > MAX_TICKETS_SHOWN,
        date: p.created_at,
      };
    });

    const totals = {
      conversions: conversions.length,
      earnings: codeStats.reduce((a, c) => a + c.earnings, 0),
    };

    return jsonResponse({ codes: codeStats, referrals, totals });
  } catch (err) {
    console.error("affiliate-stats error:", err);
    return jsonResponse({ error: "Affiliate stats could not be loaded." }, 500);
  }
});
