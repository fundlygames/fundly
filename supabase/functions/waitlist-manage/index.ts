// waitlist-manage — admin.html Waitlist sekce: seznam + pozvání dalších lidí.
// POST { action: "list" } | { action: "invite", id } | { action: "invite_batch", count }
// Chráněno x-admin-key (isAdminRequest).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { isAdminRequest } from "../_shared/admin.ts";
import { sendEmail } from "../_shared/email.ts";
import { launchCapacity, soldCount } from "../_shared/capacity.ts";
import { packageByKey } from "../_shared/packages.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://fundly.games";

// deno-lint-ignore no-explicit-any
function inviteHtml(row: any): string {
  const pkg = row.package_key ? packageByKey(row.package_key) : null;
  const link = `${SITE_URL}/checkout${pkg ? `?package=${pkg.key}` : ""}`;
  return `<div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">A spot just opened up</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 20px">You're invited to complete your Fundly Challenge purchase. This invite is tied to ${row.email} — sign up with the same e-mail to unlock checkout.</p>
      <a href="${link}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">Complete your purchase</a>
    </div>
  </div>`;
}

// deno-lint-ignore no-explicit-any
async function inviteRow(supabase: any, row: any) {
  await supabase
    .from("waitlist")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", row.id);
  return sendEmail({
    to: row.email,
    subject: "A Fundly spot just opened up for you",
    html: inviteHtml(row),
  });
}

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

    if (action === "invite") {
      const id = String(body.id ?? "");
      if (!id) return jsonResponse({ error: "Missing id." }, 400);
      const { data: row, error: fetchError } = await supabase
        .from("waitlist")
        .select("id, email, package_key")
        .eq("id", id)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!row) return jsonResponse({ error: "Waitlist entry not found." }, 404);

      const emailResult = await inviteRow(supabase, row);
      return jsonResponse({ ok: true, emailSent: emailResult.sent, emailError: emailResult.error });
    }

    if (action === "invite_batch") {
      const count = Math.max(1, Math.min(50, Number(body.count) || 1));
      const { data: rows, error } = await supabase
        .from("waitlist")
        .select("id, email, package_key")
        .is("invited_at", null)
        .order("created_at", { ascending: true })
        .limit(count);
      if (error) throw error;

      const results = await Promise.all((rows ?? []).map((row) => inviteRow(supabase, row)));
      const sentCount = results.filter((r) => r.sent).length;
      return jsonResponse({ ok: true, invited: rows?.length ?? 0, emailsSent: sentCount });
    }

    // action === "list" (default): waitlist + aktuální stav kapacity
    const [{ data: rows, error }, cap] = await Promise.all([
      supabase
        .from("waitlist")
        .select("id, email, package_key, created_at, invited_at, redeemed_at")
        .order("created_at", { ascending: true })
        .limit(500),
      Promise.resolve(launchCapacity()),
    ]);
    if (error) throw error;

    const sold = cap !== null ? await soldCount(supabase) : null;
    return jsonResponse({
      ok: true,
      waitlist: rows ?? [],
      capacity: cap,
      sold,
      spotsLeft: cap !== null ? Math.max(0, cap - (sold ?? 0)) : null,
    });
  } catch (err) {
    console.error("waitlist-manage error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Request failed." },
      500,
    );
  }
});
