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

    const companyId = Deno.env.get("WHOP_COMPANY_ID");
    if (!companyId) throw new Error("WHOP_COMPANY_ID is not set");

    // Přednostně existující plan z Whop dashboardu (env WHOP_PLAN_<KEY>),
    // jinak inline plan s cenou ze serverové mapy balíčků.
    const planId = whopPlanId(pkg.key);
    const body: Record<string, unknown> = {
      company_id: companyId,
      // po zaplacení Whop přesměruje zpět na dashboard
      redirect_url: `${SITE_URL}/dashboard.html?paid=1`,
      metadata: { package_key: pkg.key, email: String(email).trim() },
    };
    if (planId) {
      body.plan_id = planId;
    } else {
      // dle OpenAPI: company_id a currency jsou povinné uvnitř inline plan objektu;
      // product s external_identifier se najde nebo založí (find-or-create)
      body.plan = {
        company_id: companyId,
        currency: pkg.currency,
        initial_price: pkg.price,
        plan_type: "one_time",
        title: `Fundly ${pkg.name}`,
        product: {
          external_identifier: "fundly-challenge",
          title: "Fundly výzva",
        },
      };
    }

    const checkout = await whopFetch("/checkout_configurations", {
      method: "POST",
      body,
    });

    // Hosted checkout URL je v poli purchase_url odpovědi.
    const checkoutUrl = checkout.purchase_url ?? null;
    if (!checkoutUrl) {
      throw new Error("Whop nevrátil purchase_url.");
    }

    return jsonResponse({ checkoutUrl });
  } catch (err) {
    console.error("whop-checkout error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Checkout se nepodařilo vytvořit." },
      500,
    );
  }
});
