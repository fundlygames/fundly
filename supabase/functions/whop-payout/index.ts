// whop-payout — výplata hráče přes Whop transfer, volaná z admin.html.
// POST { accountId, amount, payoutId? } + hlavička x-admin-key → { status, transferId }
// S payoutId se schvaluje existující žádost hráče (status pending → paid),
// bez payoutId se zakládá nový payout záznam jako doposud.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { isAdminRequest } from "../_shared/admin.ts";
import { whopFetch, mapKycStatus } from "../_shared/whop.ts";
import { RISK_CRITICAL } from "../_shared/risk.ts";

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
  if (!(await isAdminRequest(req))) {
    return jsonResponse({ error: "Nemáte oprávnění." }, 401);
  }

  try {
    const { accountId, amount, payoutId, action, confirmRisky } = await req.json();
    let payoutAmount = Number(amount);
    if (!accountId || (!Number.isFinite(payoutAmount) && action !== "reject")) {
      return jsonResponse({ error: "Zadejte platný účet a částku." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Zamítnutí žádosti — jen změna stavu, žádný pohyb peněz.
    if (action === "reject") {
      if (!payoutId) return jsonResponse({ error: "Chybí payoutId." }, 400);
      const { data: existing } = await supabase
        .from("payouts")
        .update({ status: "rejected" })
        .eq("id", String(payoutId))
        .eq("account_id", String(accountId))
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!existing) {
        return jsonResponse({ error: "Žádost nenalezena nebo už byla zpracována." }, 404);
      }
      return jsonResponse({ status: "rejected" });
    }

    if (payoutAmount <= 0 || payoutAmount > 100000) {
      return jsonResponse({ error: "Amount must be $1–$100,000." }, 400);
    }

    const { data: account } = await supabase
      .from("challenge_accounts")
      .select("id, email, kyc_status, risk_score, risk_reasons")
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

    // ---------- KYC gate: bez ověřené identity transfer neprovedeme ----------
    // Stav čteme z účtu (zapisuje whop-webhook). U 'unknown' se ho pokusíme
    // dočíst z Whop API (GET /verifications?account_id=biz_..., profil
    // příjemce hledáme podle jeho Whop user id) a uložíme na účet.
    let kycStatus: string = account.kyc_status ?? "unknown";
    if (kycStatus === "unknown") {
      try {
        const companyId = Deno.env.get("WHOP_COMPANY_ID");
        // deno-lint-ignore no-explicit-any
        const list: any = await whopFetch(`/verifications?account_id=${companyId}`);
        const items = list?.data ?? list?.verifications ?? [];
        const prof = items.find(
          // deno-lint-ignore no-explicit-any
          (v: any) => v.user_id === whopUserId || v.user?.id === whopUserId,
        );
        if (prof?.status) {
          kycStatus = mapKycStatus(String(prof.status));
          await supabase
            .from("challenge_accounts")
            .update({ kyc_status: kycStatus })
            .eq("id", account.id);
        }
      } catch (e) {
        // read endpoint nemusí být dostupný — transfer pak posoudí sám Whop
        console.error("KYC read před payoutem selhal:", e);
      }
    }
    if (kycStatus === "failed") {
      // žádost NECHÁVÁME ve stavu pending
      return jsonResponse(
        { error: "Hráč nemá dokončené ověření identity (KYC) ve Whopu." },
        400,
      );
    }

    // Rizikový účet (skóre >= 100, tj. aspoň jeden CRITICAL flag): auto-hold,
    // transfer zatím neprovedeme — admin ho musí potvrdit druhým voláním
    // s confirmRisky: true (varování v admin UI, sekce Problémy).
    const riskScore = Number(account.risk_score) || 0;
    if (riskScore >= RISK_CRITICAL && !confirmRisky) {
      return jsonResponse({
        needsConfirm: true,
        riskScore,
        riskReasons: Array.isArray(account.risk_reasons) ? account.risk_reasons : [],
      });
    }

    // záznam payoutu předem — jeho id použijeme jako idempotency klíč transferu.
    // S payoutId (schválení žádosti z admin přehledu) aktualizujeme existující
    // řádek od hráče, bez payoutId zakládáme nový jako doposud.
    let payout: { id: string };
    if (payoutId) {
      const { data: existing, error: existingError } = await supabase
        .from("payouts")
        .select("id, account_id, amount, status")
        .eq("id", String(payoutId))
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing || existing.account_id !== account.id) {
        return jsonResponse({ error: "Žádost o výplatu nenalezena." }, 404);
      }
      if (existing.status !== "pending") {
        return jsonResponse({ error: "Tato žádost už byla zpracována." }, 400);
      }
      payout = existing;
      payoutAmount = Number(existing.amount);
    } else {
      // Bez payoutId (tlačítko „Vyplatit“ u hráče): když na účtu čeká pending
      // žádost, použijeme ji místo zakládání duplicitního řádku.
      const { data: pending } = await supabase
        .from("payouts")
        .select("id, account_id, amount, status")
        .eq("account_id", account.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (pending) {
        payout = pending;
        payoutAmount = Number(pending.amount);
      } else {
        const { data: inserted, error: payoutError } = await supabase
          .from("payouts")
          .insert({ account_id: account.id, amount: payoutAmount, status: "pending" })
          .select("id")
          .single();
        if (payoutError) throw payoutError;
        payout = inserted;
      }
    }

    try {
      const transfer = await createWhopTransfer({
        amount: payoutAmount,
        currency: "usd",
        destinationUserId: whopUserId,
        idempotenceKey: payout.id,
        note: "Fundly výplata",
      });

      const finalStatus = payoutId ? "paid" : "sent";
      await supabase
        .from("payouts")
        .update({ status: finalStatus, whop_transfer_id: transfer.id ?? null })
        .eq("id", payout.id);

      return jsonResponse({ status: finalStatus, transferId: transfer.id ?? null });
    } catch (transferErr) {
      // Whop odmítl transfer kvůli chybějícímu KYC → payout NECHÁME pending,
      // ať jde zopakovat po dokončení ověření.
      const msg = transferErr instanceof Error ? transferErr.message : "";
      if (/verif|kyc|identity/i.test(msg)) {
        await supabase
          .from("challenge_accounts")
          .update({ kyc_status: "unknown" })
          .eq("id", account.id);
        return jsonResponse(
          { error: "Hráč nemá dokončené ověření identity (KYC) ve Whopu." },
          400,
        );
      }
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
