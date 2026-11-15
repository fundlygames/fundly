// waitlist-join — veřejný endpoint (checkout.html): přidá e-mail na waitlist.
// POST { email, packageKey?, lang? } → { ok }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { sendEmail, waitlistJoinedHtml, subjects } from "../_shared/email.ts";
import { userLang } from "../_shared/user-lang.ts";
import { packageByKey } from "../_shared/packages.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { email, packageKey, lang: langHint } = await req.json();
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

    userLang(supabase, { email: cleanEmail, hint: typeof langHint === "string" ? langHint : null })
      .then((lang) => sendEmail({
        to: cleanEmail,
        subject: subjects.waitlistJoined(lang),
        html: waitlistJoinedHtml(pkg?.name ?? null, lang),
      }))
      .catch(() => { /* best-effort, e-mail už je na waitlistu i bez potvrzovacího mailu */ });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("waitlist-join error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Could not join the waitlist." },
      500,
    );
  }
});
