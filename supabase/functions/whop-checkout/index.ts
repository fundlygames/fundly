// whop-checkout — vytvoří Whop checkout configuration a vrátí hosted checkout URL.
// POST { packageKey, email } → { checkoutUrl }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { packageByKey, whopPlanId } from "../_shared/packages.ts";
import { whopFetch } from "../_shared/whop.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://matejc-beep.github.io/fundly";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { packageKey, email } = await req.json();

    const pkg = packageByKey(String(packageKey ?? ""));
    if (!pkg) return jsonResponse({ error: "Neznámý balíček." }, 400);
    if (!EMAIL_RE.test(String(email ?? ""))) {
      return jsonResponse({ error: "Zadejte platný e-mail." }, 400);
    }

    // Company kontext nese samotný API klíč — company_id se do body NEPOSÍLÁ
    // (Whop by odpověděl "Cannot provide company_id for this configuration").
    if (!Deno.env.get("WHOP_COMPANY_ID")) throw new Error("WHOP_COMPANY_ID is not set");

    // Přednostně existující plan z Whop dashboardu (env WHOP_PLAN_<KEY>),
    // jinak inline plan s cenou ze serverové mapy balíčků. Balíčky jsou
    // měsíční (renewal, 30 dní), activation je jednorázový poplatek.
    const planId = whopPlanId(pkg.key);
    const body: Record<string, unknown> = {
      // po zaplacení Whop přesměruje zpět na dashboard
      redirect_url: `${SITE_URL}/dashboard.html?paid=1`,
      metadata: { package_key: pkg.key, email: String(email).trim() },
    };
    if (planId) {
      body.plan_id = planId;
    } else if (pkg.key === "activation") {
      body.plan = {
        currency: pkg.currency,
        initial_price: pkg.price,
        plan_type: "one_time",
        title: "Fundly Activation Fee",
        product: {
          external_identifier: "fundly-activation",
          title: "Fundly Activation Fee",
        },
      };
    } else {
      body.plan = {
        currency: pkg.currency,
        initial_price: pkg.price,
        renewal_price: pkg.price,
        billing_period: 30,
        plan_type: "renewal",
        title: `Fundly ${pkg.name} (monthly)`,
        product: {
          external_identifier: "fundly-challenge",
          title: "Fundly Challenge",
        },
      };
    }

    const checkout = await whopFetch("/checkout_configurations", {
      method: "POST",
      body,
    });

    // Hosted checkout URL je v poli purchase_url odpovědi; pro embedded
    // checkout (krok 3 na naší stránce) vracíme i session id a plan id.
    const checkoutUrl = checkout.purchase_url ?? null;
    if (!checkoutUrl) {
      throw new Error("Whop nevrátil purchase_url.");
    }

    return jsonResponse({
      checkoutUrl,
      sessionId: checkout.id ?? null,
      planId: planId ?? checkout.plan?.id ?? null,
    });
  } catch (err) {
    console.error("whop-checkout error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Checkout se nepodařilo vytvořit." },
      500,
    );
  }
});
