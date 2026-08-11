// support-submit — kontaktní formulář (homepage i dashboard) → support_tickets.
// POST { email, subject?, message, source? } → { ok, ticket }
// Veřejný endpoint (nepřihlášený návštěvník na homepage smí napsat), pokud
// jde požadavek s platným access tokenem, spárujeme tiket s user_id.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { email, subject, message, source } = await req.json();
    if (!EMAIL_RE.test(String(email ?? ""))) {
      return jsonResponse({ error: "Enter a valid email address." }, 400);
    }
    const msg = String(message ?? "").trim();
    if (!msg || msg.length > 4000) {
      return jsonResponse({ error: "Enter a message (up to 4000 characters)." }, 400);
    }

    // volitelné spárování s přihlášeným účtem (nepovinné — kontakt formulář
    // na homepage může vyplnit i nepřihlášený návštěvník)
    let userId: string | null = null;
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      userId = data?.user?.id ?? null;
    }

    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .insert({
        email: String(email).trim(),
        user_id: userId,
        subject: subject ? String(subject).slice(0, 200) : null,
        message: msg,
        source: source === "dashboard" ? "dashboard" : "contact_form",
      })
      .select("id, created_at")
      .single();
    if (error) throw error;

    return jsonResponse({ ok: true, ticket });
  } catch (err) {
    console.error("support-submit error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "The message could not be sent." },
      500,
    );
  }
});
