// admin-account-tickets — kompletní tiketová historie jednoho challenge účtu
// pro admin sekci (Hráči → detail hráče → "Zobrazit tikety a průběh").
// Dřív admin viděl jen souhrny (počet tiketů, výherní podíl) uložené na
// challenge_accounts — tohle vrací každý jednotlivý tiket (selekce, kurz,
// vklad, výsledek, výplata) plus účet samotný, aby šlo přesně dohledat, jak
// se hráčův zůstatek vyvíjel den po dni před schválením přechodu do další fáze.
// POST { accountId } — admin-only (x-admin-key nebo JWT admina).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { isAdminRequest } from "../_shared/admin.ts";

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
    const body = await req.json().catch(() => ({}));
    const accountId = String(body.accountId ?? "");
    if (!accountId) return jsonResponse({ error: "Missing accountId." }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: account, error: accError } = await supabase
      .from("challenge_accounts")
      .select("id, email, package_key, capital, phase, phase_balance, phase_baseline, phase_started_at, created_at")
      .eq("id", accountId)
      .maybeSingle();
    if (accError) throw accError;
    if (!account) return jsonResponse({ error: "Account not found." }, 404);

    const { data: tickets, error: tError } = await supabase
      .from("tickets")
      .select("client_ticket_id, selections, stake, combined_odds, status, placed_at, settled_at, payout")
      .eq("account_id", accountId)
      .order("placed_at", { ascending: true })
      .limit(2000);
    if (tError) throw tError;

    return jsonResponse({ ok: true, account, tickets: tickets ?? [] });
  } catch (err) {
    console.error("admin-account-tickets error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Could not load ticket history." },
      500,
    );
  }
});
