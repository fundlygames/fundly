// whop-checkout — vytvoří Whop checkout configuration a vrátí hosted checkout URL.
// POST { packageKey, email } → { checkoutUrl }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { packageByKey, whopPlanId, resetPrice } from "../_shared/packages.ts";
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
    const { packageKey, email, reset, tracking } = await req.json();

    const pkg = packageByKey(String(packageKey ?? ""));
    if (!pkg) return jsonResponse({ error: "Neznámý balíček." }, 400);
    if (!EMAIL_RE.test(String(email ?? ""))) {
      return jsonResponse({ error: "Zadejte platný e-mail." }, 400);
    }

    let resetAccountId: string | null = null;

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

      // Reset po spálení účtu (40 % z ceny balíčku, viz terms.html §4.5): jen
      // pro e-mail, který má spálený účet STEJNÉHO balíčku, na kterém se reset
      // ještě nepoužil (flag "reset_used" ho zapíše whop-webhook po zaplacení).
      if (reset === true) {
        const { data: breachedRows } = await supabase
          .from("challenge_accounts")
          .select("id, flags")
          .eq("email", String(email).trim())
          .eq("package_key", pkg.key)
          .eq("state", "breached")
          .order("created_at", { ascending: false })
          .limit(10);
        const eligible = (breachedRows ?? []).find(
          (a: { flags: string[] | null }) => !(Array.isArray(a.flags) && a.flags.includes("reset_used")),
        );
        if (!eligible) {
          return jsonResponse(
            { error: "No breached account eligible for a reset on this e-mail (a reset can be used once per closed account, on the same package).", code: "NO_RESET" },
            400,
          );
        }
        resetAccountId = eligible.id;
      }

      // Limit "jen prvních N kupujících" (LAUNCH_CAPACITY) — reset se nepočítá,
      // je to už existující zákazník.
      const cap = resetAccountId ? null : launchCapacity();
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

    // Meta atribuce z prohlížeče (fbp/fbc/UA/URL + ID nákupu pro deduplikaci) protéká
    // metadaty do whop-webhook, který z toho skládá server-side Purchase (CAPI).
    const clip = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : null);
    const trackingMeta: Record<string, string> = {};
    if (tracking && typeof tracking === "object") {
      const t = tracking as Record<string, unknown>;
      const put = (k: string, v: string | null) => { if (v) trackingMeta[k] = v; };
      put("meta_fbp", clip(t.fbp, 120));
      put("meta_fbc", clip(t.fbc, 200));
      put("meta_ua", clip(t.ua, 250));
      put("meta_url", clip(t.url, 250));
      put("meta_event_id", clip(t.eventId, 80));
      const at = (t.attribution && typeof t.attribution === "object" ? t.attribution : {}) as Record<string, unknown>;
      for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "landing"]) put(k, clip(at[k], 100));
    }

    // reset má vlastní (nižší) cenu, proto nikdy nepoužije pevný Whop plán balíčku
    const planId = resetAccountId ? null : whopPlanId(pkg.key);
    const body: Record<string, unknown> = {
      // po zaplacení Whop přesměruje zpět na dashboard
      redirect_url: `${SITE_URL}/dashboard.html?paid=1`,
      metadata: {
        package_key: pkg.key,
        email: String(email).trim(),
        ...(resetAccountId ? { reset_account_id: resetAccountId } : {}),
        ...(checkoutIp ? { checkout_ip: checkoutIp } : {}),
        ...trackingMeta,
      },
    };
    if (planId) {
      body.plan_id = planId;
    } else {
      body.plan = {
        currency: pkg.currency,
        initial_price: resetAccountId ? resetPrice(pkg) : pkg.price,
        plan_type: "one_time",
        title: pkg.key === "activation" ? "Fundly Activation Fee" : resetAccountId ? `Fundly ${pkg.name} Reset` : `Fundly ${pkg.name}`,
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
