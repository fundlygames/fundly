// checkout-welcome-email — volá se z checkout.js hned po úspěšném
// auth.signUp() ve druhém kroku checkoutu (nový účet, ne fallback signIn na
// existující). Best-effort: pokud e-mail selže, checkout tím není blokován
// — klient na chybu nijak nereaguje, jen ji zaloguje.
// POST { email } → { ok: true }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { sendEmail, checkoutWelcomeHtml } from "../_shared/email.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

    const result = await sendEmail({
      to: email,
      subject: "Welcome to Fundly",
      html: checkoutWelcomeHtml(`${SITE_URL}/dashboard`),
    });
    if (!result.sent) {
      console.error("checkout-welcome-email selhal:", result.error);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("checkout-welcome-email error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Could not send the welcome e-mail." },
      500,
    );
  }
});
