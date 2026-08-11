// support-manage — admin.html Support sekce: seznam/filtr tiketů + odpověď.
// POST { action: "list", status? } | { action: "reply", ticketId, reply } | { action: "close", ticketId }
// Chráněno x-admin-key (isAdminRequest).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { isAdminRequest } from "../_shared/admin.ts";
import { sendEmail, supportReplyHtml } from "../_shared/email.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!(await isAdminRequest(req))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "reply") {
      const ticketId = String(body.ticketId ?? "");
      const reply = String(body.reply ?? "").trim();
      if (!ticketId || !reply) {
        return jsonResponse({ error: "Missing ticketId or reply." }, 400);
      }
      const { data: ticket, error: fetchError } = await supabase
        .from("support_tickets")
        .select("id, email, message")
        .eq("id", ticketId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!ticket) return jsonResponse({ error: "Ticket not found." }, 404);

      const { error: updateError } = await supabase
        .from("support_tickets")
        .update({ admin_reply: reply, status: "answered", replied_at: new Date().toISOString() })
        .eq("id", ticketId);
      if (updateError) throw updateError;

      const emailResult = await sendEmail({
        to: ticket.email,
        subject: "Reply from Fundly support",
        html: supportReplyHtml(ticket.message, reply),
      });

      return jsonResponse({ ok: true, emailSent: emailResult.sent, emailError: emailResult.error });
    }

    if (action === "close") {
      const ticketId = String(body.ticketId ?? "");
      if (!ticketId) return jsonResponse({ error: "Missing ticketId." }, 400);
      const { error } = await supabase
        .from("support_tickets")
        .update({ status: "closed" })
        .eq("id", ticketId);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    // action === "list" (default): filtr podle statusu, nejnovější první
    const status = body.status && ["open", "answered", "closed"].includes(body.status)
      ? body.status
      : null;
    let query = supabase
      .from("support_tickets")
      .select("id, email, subject, message, source, status, admin_reply, replied_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (status) query = query.eq("status", status);
    const { data: tickets, error } = await query;
    if (error) throw error;

    return jsonResponse({ ok: true, tickets: tickets ?? [] });
  } catch (err) {
    console.error("support-manage error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Request failed." },
      500,
    );
  }
});
