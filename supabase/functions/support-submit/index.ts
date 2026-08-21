// support-submit — kontaktní formulář (homepage i dashboard) → support_tickets.
// POST { email, subject?, message, source? } → { ok, ticket }
// Veřejný endpoint (nepřihlášený návštěvník na homepage smí napsat), pokud
// jde požadavek s platným access tokenem, spárujeme tiket s user_id.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email.ts";

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

    // Notifikace na support@fundly.games — dřív se nový tiket jen tiše
    // zapsal do support_tickets a nikdo se o něm nedozvěděl, dokud admin
    // ručně nezkontroloval admin.html. Best-effort: chybějící RESEND_API_KEY
    // (viz _shared/email.ts) tohle tiše přeskočí, zápis tiketu tím není ohrožen.
    const notifyTo = Deno.env.get("SUPPORT_NOTIFY_EMAIL") ?? "support@fundly.games";
    sendEmail({
      to: notifyTo,
      subject: `New support ticket${subject ? `: ${String(subject).slice(0, 100)}` : ""}`,
      html: `<div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
        <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
          <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
          <h2 style="color:#fff;font-size:18px;margin:0 0 12px">New support ticket</h2>
          <p style="color:#a0a0ab;font-size:13px;margin:0 0 4px">From: ${String(email).trim().replace(/</g, "&lt;")}</p>
          <p style="color:#a0a0ab;font-size:13px;margin:0 0 16px">Source: ${source === "dashboard" ? "dashboard" : "contact form"}</p>
          <p style="color:#e8e8ec;font-size:14px;line-height:1.6;white-space:pre-wrap">${msg.replace(/</g, "&lt;")}</p>
        </div>
      </div>`,
    }).catch(() => { /* notifikace je best-effort, tiket už je uložený */ });

    return jsonResponse({ ok: true, ticket });
  } catch (err) {
    console.error("support-submit error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "The message could not be sent." },
      500,
    );
  }
});
