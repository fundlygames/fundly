// whop-checkout — vytvoří Whop checkout configuration a vrátí hosted checkout URL.
// POST { packageKey, email } → { checkoutUrl }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { packageByKey, whopPlanId } from "../_shared/packages.ts";
import { whopFetch } from "../_shared/whop.ts";
import { launchCapacity, soldCount, isInvited } from "../_shared/capacity.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://fundly.games";
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

    // Aktivační poplatek (funded účet) je doplatek existujícího účtu, ne
    // nový nákup, proto se obě kontroly níž přeskakují jen pro něj.
    if (pkg.key !== "activation") {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      // Jeden e-mail = max. jeden aktivní účet zároveň. Bez tohohle nic
      // nebránilo tomu si koupit další balíček (a zaplatit za něj) i s
      // účtem, který je pořád active/funded/pending_approval — reálně
      // zachyceno: jeden zákazník takhle měl čtyři souběžně aktivní
      // Starter účty.
      const { data: existing } = await supabase
        .from("challenge_accounts")
        .select("id")
        .eq("email", String(email).trim())
        .in("state", ["active", "funded", "pending_approval"])
        .limit(1)
        .maybeSingle();
      if (existing) {
        return jsonResponse(
          { error: "You already have an active Challenge on this e-mail. Finish it, wait for a breach, or reset it before starting a new one.", code: "ALREADY_ACTIVE" },
          409,
        );
      }

      // Limit "jen prvních N kupujících" (LAUNCH_CAPACITY).
      const cap = launchCapacity();
      if (cap !== null) {
        const sold = await soldCount(supabase);
        if (sold >= cap && !(await isInvited(supabase, String(email)))) {
          return jsonResponse({ error: "Launch spots are full.", code: "SOLD_OUT" }, 409);
        }
      }
    }

    // Company kontext nese samotný API klíč — company_id se do body NEPOSÍLÁ
    // (Whop by odpověděl "Cannot provide company_id for this configuration").
    if (!Deno.env.get("WHOP_COMPANY_ID")) throw new Error("WHOP_COMPANY_ID is not set");

    // Přednostně existující plan z Whop dashboardu (env WHOP_PLAN_<KEY>),
    // jinak inline plan s cenou ze serverové mapy balíčků. Balíčky jsou
    // jednorázové (one-time fee), activation taktéž.
    // klientovo IP protéká metadaty až do webhooku (Whop server-to-server
    // volání nese jen IP Whopu, ne zákazníka) — používá ho risk-scoring
    // pro SHARED_DEVICE_IP mezi účty.
    const checkoutIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? req.headers.get("cf-connecting-ip")
      ?? null;

    const planId = whopPlanId(pkg.key);
    const body: Record<string, unknown> = {
      // po zaplacení Whop přesměruje zpět na dashboard
      redirect_url: `${SITE_URL}/dashboard.html?paid=1`,
      metadata: {
        package_key: pkg.key,
        email: String(email).trim(),
        ...(checkoutIp ? { checkout_ip: checkoutIp } : {}),
      },
    };
    if (planId) {
      body.plan_id = planId;
    } else {
      body.plan = {
        currency: pkg.currency,
        initial_price: pkg.price,
        plan_type: "one_time",
        title: pkg.key === "activation" ? "Fundly Activation Fee" : `Fundly ${pkg.name}`,
        product: {
          external_identifier: pkg.key === "activation" ? "fundly-activation" : "fundly-challenge",
          title: pkg.key === "activation" ? "Fundly Activation Fee" : "Fundly Challenge",
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
