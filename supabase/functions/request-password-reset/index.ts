// request-password-reset — sends the password-reset e-mail ourselves via
// Resend, instead of Supabase's own (unconfigured — no custom SMTP) auth
// mailer. POST { email } → always { ok: true }, regardless of whether the
// e-mail actually belongs to an account (no user-enumeration signal).
//
// generateLink(type: "recovery") needs the service-role key, so this can't
// run client-side — js/whop.js's FundlyAuth.resetPassword() calls this
// function instead of client.auth.resetPasswordForEmail().
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://fundly.games";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resetHtml(actionLink: string): string {
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">Reset your password</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 20px">Someone (hopefully you) asked to reset the password on your Fundly account. Click below to set a new one — this link works once and expires soon.</p>
      <a href="${actionLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">Reset password</a>
      <p style="color:#5a5a66;font-size:12px;line-height:1.6;margin:20px 0 0">Didn't request this? You can safely ignore this e-mail — your password won't change unless you click the link above.</p>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:20px 0" />
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
    // Same response either way (see file header) — but still bail out on
    // garbage input before touching the admin API.
    if (!EMAIL_RE.test(email)) return jsonResponse({ ok: true });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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
        subject: "Reset your Fundly password",
        html: resetHtml(data.properties.action_link),
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
