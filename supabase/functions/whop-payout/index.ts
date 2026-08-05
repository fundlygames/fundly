// whop-payout — výplata hráče přes Whop transfer, volaná z admin.html.
// POST { accountId, amount } + hlavička x-admin-key → { status, transferId }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { isValidAdminKey } from "../_shared/admin.ts";
import { whopFetch } from "../_shared/whop.ts";

// Vytvoří Whop transfer z firemního ledger účtu hráči (podle jeho Whop user id).
// Endpoint podle Whop API reference: POST /transfers
// (amount, currency, origin_id = company biz_..., destination_id = user_...).
// TODO: pokud by Whop payout flow vyžadoval jiný endpoint (např. withdrawals
// nebo payout portal), stačí upravit tuto jednu funkci.
async function createWhopTransfer(params: {
  amount: number;
  currency: string;
  destinationUserId: string;
  idempotenceKey: string;
  note: string;
}): Promise<{ id: string }> {
  const companyId = Deno.env.get("WHOP_COMPANY_ID");
  if (!companyId) throw new Error("WHOP_COMPANY_ID is not set");

  return await whopFetch("/transfers", {
    method: "POST",
    body: {
      amount: params.amount,
      currency: params.currency,
      origin_id: companyId,
      destination_id: params.destinationUserId,
      idempotence_key: params.idempotenceKey,
      notes: params.note,
    },
  });
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!(await isValidAdminKey(req))) {
    return jsonResponse({ error: "Neplatný admin klíč." }, 401);
  }

  try {
    const { accountId, amount } = await req.json();
    const payoutAmount = Number(amount);
    if (!accountId || !Number.isFinite(payoutAmount) || payoutAmount <= 0) {
      return jsonResponse({ error: "Zadejte platný účet a částku." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: account } = await supabase
      .from("challenge_accounts")
      .select("id, email")
      .eq("id", String(accountId))
      .maybeSingle();
    if (!account) return jsonResponse({ error: "Účet nenalezen." }, 404);

    // Whop user id příjemce bereme z payloadu jeho poslední úspěšné platby.
    const { data: payment } = await supabase
      .from("payments")
      .select("whop_metadata")
      .eq("email", account.email)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const whopUserId = payment?.whop_metadata?.user?.id ?? null;
    if (!whopUserId) {
      return jsonResponse(
        { error: "Hráč nemá žádnou zaplacenou platbu s Whop účtem." },
        400,
      );
    }

    // záznam payoutu předem — jeho id použijeme jako idempotency klíč transferu
    const { data: payout, error: payoutError } = await supabase
      .from("payouts")
      .insert({ account_id: account.id, amount: payoutAmount, status: "pending" })
      .select("id")
      .single();
    if (payoutError) throw payoutError;

    try {
      const transfer = await createWhopTransfer({
        amount: payoutAmount,
        currency: "czk",
        destinationUserId: whopUserId,
        idempotenceKey: payout.id,
        note: "Fundly výplata",
      });

      await supabase
        .from("payouts")
        .update({ status: "sent", whop_transfer_id: transfer.id ?? null })
        .eq("id", payout.id);

      return jsonResponse({ status: "sent", transferId: transfer.id ?? null });
    } catch (transferErr) {
      await supabase
        .from("payouts")
        .update({ status: "failed" })
        .eq("id", payout.id);
      throw transferErr;
    }
  } catch (err) {
    console.error("whop-payout error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Výplata se nepodařila." },
      500,
    );
  }
});
