// discount-signup — e-mailový capture pop-up na homepage/get-started (30 %
// zľava). POST { email } → uloží do discount_signups (idempotentné, jeden
// e-mail = jeden riadok) a pošle kód NEWFUNDLY mailom. Kód samotný je pevný
// Whop promo kód uplatniteľný priamo v checkoute — táto funkcia len eviduje
// záujemcov pre remarketing a doručí kód.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { sendEmail, discountCodeHtml, subjects } from "../_shared/email.ts";
import { userLang } from "../_shared/user-lang.ts";
import { allow } from "../_shared/throttle.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = "NEWFUNDLY";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://fundly.games";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim();
    if (!EMAIL_RE.test(email)) {
      return jsonResponse({ error: "Enter a valid email address." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // e-mail může požádat o kód jen jednou — opakované odeslání tiše
    // neselže, jen se nezaloží duplicitní řádek (kód je stejně pořád stejný).
    const lang = typeof body.lang === "string" ? body.lang.slice(0, 5) : null;
    // zdroj příchodu (UTM z reklamy) — jen krátké textové hodnoty, ať se do jsonb nedostane nic jiného
    const attribution: Record<string, string> = {};
    if (body.attribution && typeof body.attribution === "object") {
      for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "landing"]) {
        const v = (body.attribution as Record<string, unknown>)[k];
        if (typeof v === "string" && v) attribution[k] = v.slice(0, 100);
      }
    }
    const { error } = await supabase
      .from("discount_signups")
      .upsert(
        { email, lang, ...(Object.keys(attribution).length ? { attribution } : {}) },
        { onConflict: "email", ignoreDuplicates: true },
      );
    if (error) throw error;

    // kód dostane adresa nejvýš 1× za 24 h (jinak šlo cizí schránku zahltit opakovaným voláním)
    if (await allow(supabase, `discount:${email.toLowerCase()}`, 24 * 3600_000)) {
      // jazyk: lang z pop-upu (aktuální jazyk webu), jinak jazyk účtu / doména e-mailu
      const mailLang = await userLang(supabase, { email, hint: lang });
      const result = await sendEmail({
        to: email,
        subject: subjects.discountCode(mailLang),
        html: discountCodeHtml(CODE, `${SITE_URL}/get-started`, mailLang),
      });
      if (!result.sent) console.error("discount-signup e-mail selhal:", result.error);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("discount-signup error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Could not send the code." },
      500,
    );
  }
});
