// email-unsubscribe — odhlášení z marketingových follow-up e-mailů.
// POST { email, token } z unsubscribe.html; token = HMAC podepsaný e-mail (_shared/unsubscribe.ts).
// POST { email, token, type: "weekly" } = odhlášení jen z týdenního reportu (weekly-report):
//   token = weeklyUnsubscribeToken, nastaví challenge_accounts.weekly_report_opt_out = true
//   na všech účtech s tímhle e-mailem (migrace 040). Propagační e-maily tím nemění.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { unsubscribeToken, weeklyUnsubscribeToken } from "../_shared/unsubscribe.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const token = String(body.token ?? "");
    const weekly = body.type === "weekly";
    const expected = email ? await (weekly ? weeklyUnsubscribeToken(email) : unsubscribeToken(email)) : "";
    if (!email || !token || token !== expected) {
      return jsonResponse({ error: "Invalid unsubscribe link." }, 400);
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (weekly) {
      // e-mail může být v DB s velkými písmeny → ilike (s escapovanými % a _), pak přesná shoda v JS
      const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`);
      const { data: rows, error: selError } = await supabase
        .from("challenge_accounts").select("id, email").ilike("email", pattern);
      if (selError) throw selError;
      const ids = (rows ?? []).filter((r) => String(r.email ?? "").trim().toLowerCase() === email).map((r) => r.id);
      if (ids.length) {
        const { error } = await supabase.from("challenge_accounts").update({ weekly_report_opt_out: true }).in("id", ids);
        if (error) throw error;
      }
      return jsonResponse({ ok: true, type: "weekly" });
    }
    const { error } = await supabase.from("email_unsubscribes").upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
    if (error) throw error;
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("email-unsubscribe error:", err);
    return jsonResponse({ error: "Could not unsubscribe, please write to support@fundly.games." }, 500);
  }
});
