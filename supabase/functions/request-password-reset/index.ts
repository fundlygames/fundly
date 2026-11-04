// request-password-reset — sends the password-reset e-mail ourselves via
// Resend, instead of Supabase's own (unconfigured — no custom SMTP) auth
// mailer. POST { email, lang? } → always { ok: true }, regardless of whether the
// e-mail actually belongs to an account (no user-enumeration signal).
//
// generateLink(type: "recovery") needs the service-role key, so this can't
// run client-side — js/whop.js's FundlyAuth.resetPassword() calls this
// function instead of client.auth.resetPasswordForEmail().
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { allow } from "../_shared/throttle.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://fundly.games";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Lang = "en" | "cs" | "sk" | "pl" | "hu" | "es";
const LANGS: Lang[] = ["en", "cs", "sk", "pl", "hu", "es"];
const TEXTS: Record<Lang, { subject: string; h: string; p: string; btn: string; ignore: string; q: string }> = {
  en: { subject: "Reset your Fundly password", h: "Reset your password", p: "Someone (hopefully you) asked to reset the password on your Fundly account. Click below to set a new one — this link works once and expires soon.", btn: "Reset password", ignore: "Didn't request this? You can safely ignore this e-mail — your password won't change unless you click the link above.", q: "Questions? Reach us at" },
  cs: { subject: "Obnovení hesla k účtu Fundly", h: "Obnovení hesla", p: "Někdo (doufáme, že vy) požádal o obnovení hesla k vašemu účtu Fundly. Kliknutím níže nastavíte nové — odkaz funguje jen jednou a brzy vyprší.", btn: "Obnovit heslo", ignore: "Nežádali jste o to? Tento e-mail klidně ignorujte — heslo se nezmění, dokud nekliknete na odkaz výše.", q: "Máte otázky? Napište nám na" },
  sk: { subject: "Obnovenie hesla k účtu Fundly", h: "Obnovenie hesla", p: "Niekto (dúfame, že vy) požiadal o obnovenie hesla k vášmu účtu Fundly. Kliknutím nižšie nastavíte nové — odkaz funguje len raz a čoskoro vyprší.", btn: "Obnoviť heslo", ignore: "Nežiadali ste o to? Tento e-mail pokojne ignorujte — heslo sa nezmení, kým nekliknete na odkaz vyššie.", q: "Máte otázky? Napíšte nám na" },
  pl: { subject: "Reset hasła do konta Fundly", h: "Reset hasła", p: "Ktoś (mamy nadzieję, że Ty) poprosił o reset hasła do Twojego konta Fundly. Kliknij poniżej, aby ustawić nowe — link działa tylko raz i wkrótce wygaśnie.", btn: "Zresetuj hasło", ignore: "Nie prosiłeś o to? Możesz bezpiecznie zignorować tego e-maila — hasło się nie zmieni, dopóki nie klikniesz linku powyżej.", q: "Pytania? Napisz do nas:" },
  hu: { subject: "Fundly jelszó visszaállítása", h: "Jelszó visszaállítása", p: "Valaki (remélhetőleg te) a Fundly-fiókod jelszavának visszaállítását kérte. Kattints lent az új jelszó beállításához — a link csak egyszer használható, és hamarosan lejár.", btn: "Jelszó visszaállítása", ignore: "Nem te kérted? Nyugodtan figyelmen kívül hagyhatod ezt az e-mailt — a jelszavad nem változik, amíg nem kattintasz a fenti linkre.", q: "Kérdésed van? Írj nekünk:" },
  es: { subject: "Restablece tu contraseña de Fundly", h: "Restablece tu contraseña", p: "Alguien (esperamos que tú) ha pedido restablecer la contraseña de tu cuenta de Fundly. Haz clic abajo para crear una nueva: este enlace funciona una sola vez y caduca pronto.", btn: "Restablecer contraseña", ignore: "¿No lo pediste? Puedes ignorar este correo sin problema: tu contraseña no cambiará a menos que hagas clic en el enlace de arriba.", q: "¿Preguntas? Escríbenos a" },
};

function resetHtml(actionLink: string, lang: Lang): string {
  const x = TEXTS[lang];
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">${x.h}</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 20px">${x.p}</p>
      <a href="${actionLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">${x.btn}</a>
      <p style="color:#5a5a66;font-size:12px;line-height:1.6;margin:20px 0 0">${x.ignore}</p>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:20px 0" />
      <p style="color:#5a5a66;font-size:11px;line-height:1.6;margin:0">Grindit LLC · Sharjah Media City, Sharjah, UAE · Reg. 2541536<br />${x.q} <a href="mailto:support@fundly.games" style="color:#7a7a86">support@fundly.games</a>.</p>
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
    const langIn = String(body.lang ?? "").slice(0, 2).toLowerCase();
    const lang: Lang = (LANGS as string[]).includes(langIn) ? (langIn as Lang) : "en";
    // Same response either way (see file header) — but still bail out on
    // garbage input before touching the admin API.
    if (!EMAIL_RE.test(email)) return jsonResponse({ ok: true });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Nejvýš 1 reset e-mail za minutu na adresu — jinak šlo cizí schránku zahltit.
    // Odpověď je stejná i při omezení (viz "Same response either way").
    if (!(await allow(supabase, `reset:${email.toLowerCase()}`, 60_000))) return jsonResponse({ ok: true });

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${SITE_URL}/dashboard` },
    });

    // No matching account (or any other generateLink failure) — still
    // report success to the caller so this endpoint can't be used to probe
    // which e-mails have an account.
    if (!error && data?.properties?.action_link) {
      const result = await sendEmail({
        to: email,
        subject: TEXTS[lang].subject,
        html: resetHtml(data.properties.action_link, lang),
      });
      if (!result.sent) console.error("password-reset e-mail selhal:", result.error);
    } else if (error) {
      console.error("generateLink (recovery) selhalo:", error.message);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("request-password-reset error:", err);
    // Still don't leak details to the client.
    return jsonResponse({ ok: true });
  }
});
