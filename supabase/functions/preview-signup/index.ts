// preview-signup — vytvoří skutečný auth účet pro homepage tlačítko "Preview"
// (prohlídka dashboardu bez nákupu balíčku). POST { email, password } →
// { ok: true } — klient si pak sám zavolá signInWithPassword se stejnými
// údaji, aby v prohlížeči vznikla session (admin.createUser session nevrací).
//
// Založí i řádek v preview_signups (evidence pro admina) a hned pošle
// uvítací e-mail s kódem NEWFUNDLY + prosbou o zpětnou vazbu.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { sendEmail, previewWelcomeHtml } from "../_shared/email.ts";

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
    const password = String(body.password ?? "");
    if (!EMAIL_RE.test(email)) {
      return jsonResponse({ error: "Enter a valid email address." }, 400);
    }
    if (password.length < 8) {
      return jsonResponse({ error: "Password must be at least 8 characters." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created?.user) {
      const msg = createError?.message ?? "";
      if (/already.*registere|already.*exist/i.test(msg)) {
        return jsonResponse({ error: "An account with this email already exists — log in instead." }, 409);
      }
      throw createError ?? new Error("Could not create the account.");
    }

    await supabase.from("preview_signups").insert({ user_id: created.user.id, email });

    const result = await sendEmail({
      to: email,
      subject: "Welcome to your Fundly preview",
      html: previewWelcomeHtml(`${SITE_URL}/dashboard`),
    });
    if (result.sent) {
      await supabase
        .from("preview_signups")
        .update({ welcome_email_sent_at: new Date().toISOString() })
        .eq("user_id", created.user.id);
    } else {
      console.error("preview-signup welcome e-mail selhal:", result.error);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("preview-signup error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Could not create the account." },
      500,
    );
  }
});
