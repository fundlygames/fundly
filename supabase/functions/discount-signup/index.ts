// discount-signup — e-mailový capture pop-up na homepage/get-started (40 %
// zľava). POST { email } → uloží do discount_signups (idempotentné, jeden
// e-mail = jeden riadok) a pošle kód NEWFUNDLY mailom. Kód samotný je pevný
// Whop promo kód uplatniteľný priamo v checkoute — táto funkcia len eviduje
// záujemcov pre remarketing a doručí kód.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = "NEWFUNDLY";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://fundly.games";

function discountHtml(): string {
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">Here's your 40% off code</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 20px">Enter this code at checkout on any package:</p>
      <div style="background:#14f19522;border:1px solid #14f19555;border-radius:10px;padding:14px 20px;text-align:center;font-family:'SF Mono',ui-monospace,monospace;font-size:20px;font-weight:700;letter-spacing:.08em;color:#14f195;margin:0 0 20px">${CODE}</div>
      <a href="${SITE_URL}/get-started" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">Get funded now</a>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      <p style="color:#5a5a66;font-size:11px;line-height:1.6;margin:0">Grindit LLC · Sharjah Media City, Sharjah, UAE · Reg. 2541536<br />Questions? Reach us at <a href="mailto:support@fundly.games" style="color:#7a7a86">support@fundly.games</a>.</p>
    </div>
  </div>`;
}

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
    const { error } = await supabase
      .from("discount_signups")
      .upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
    if (error) throw error;

    const result = await sendEmail({
      to: email,
      subject: "Your 40% off Fundly code",
      html: discountHtml(),
    });
    if (!result.sent) console.error("discount-signup e-mail selhal:", result.error);

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("discount-signup error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Could not send the code." },
      500,
    );
  }
});
