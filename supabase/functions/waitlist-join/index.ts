// waitlist-join — veřejný endpoint (checkout.html): přidá e-mail na waitlist.
// POST { email, packageKey? } → { ok }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";
import { packageByKey } from "../_shared/packages.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { email, packageKey } = await req.json();
    const cleanEmail = String(email ?? "").trim();
    if (!EMAIL_RE.test(cleanEmail)) {
      return jsonResponse({ error: "Enter a valid email address." }, 400);
    }
    const pkg = packageKey ? packageByKey(String(packageKey)) : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // e-mail může na waitlistu být jen jednou — opakované přihlášení tiše
    // aktualizuje jen preferovaný balíček, nezaloží duplicitu.
    const { error } = await supabase
      .from("waitlist")
      .upsert(
        { email: cleanEmail, package_key: pkg?.key ?? null },
        { onConflict: "email", ignoreDuplicates: false },
      );
    if (error) throw error;

    sendEmail({
      to: cleanEmail,
      subject: "You're on the Fundly waitlist",
      html: `<div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
        <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
          <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
          <h2 style="color:#fff;font-size:18px;margin:0 0 12px">You're on the waitlist</h2>
          <p style="color:#a0a0ab;font-size:14px;line-height:1.6">Launch spots are full right now. We'll email you an invite link as soon as a spot opens up${pkg ? ` for the ${pkg.name} package` : ""}.</p>
        </div>
      </div>`,
    }).catch(() => { /* best-effort, e-mail už je na waitlistu i bez potvrzovacího mailu */ });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("waitlist-join error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Could not join the waitlist." },
      500,
    );
  }
});
