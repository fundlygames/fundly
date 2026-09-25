// email-unsubscribe — odhlášení z marketingových follow-up e-mailů.
// POST { email, token } z unsubscribe.html; token = HMAC podepsaný e-mail (_shared/unsubscribe.ts).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { unsubscribeToken } from "../_shared/unsubscribe.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const token = String(body.token ?? "");
    if (!email || !token || token !== (await unsubscribeToken(email))) {
      return jsonResponse({ error: "Invalid unsubscribe link." }, 400);
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await supabase.from("email_unsubscribes").upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
    if (error) throw error;
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("email-unsubscribe error:", err);
    return jsonResponse({ error: "Could not unsubscribe, please write to support@fundly.games." }, 500);
  }
});
