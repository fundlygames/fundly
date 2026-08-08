// affiliate-manage — správa affiliate promo kódů z admin.html.
// POST { action: "create" | "list" | "archive", ... }, chráněno x-admin-key.
// create: založí promo kód ve Whop (POST /promo_codes — nativně umí procentuální
// slevu a globální limit použití přes stock/unlimited_stock) + záznam v
// affiliate_codes. archive: DELETE /promo_codes/{id} (Whop kód archivuje)
// + vypne active. list: kódy s počty použití z payments.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { isValidAdminKey } from "../_shared/admin.ts";
import { whopFetch } from "../_shared/whop.ts";
import { PACKAGES, whopPlanId } from "../_shared/packages.ts";

const CODE_RE = /^[A-Z0-9]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// deno-lint-ignore no-explicit-any
function supabaseAdmin(): any {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// company_id posíláme jen když ho Whop vyžaduje — s Company API klíčem některé
// endpointy company_id v body odmítnou ("Cannot provide company_id ..."),
// proto při takové chybě zkusíme znovu bez něj (stejná zkušenost jako u
// /checkout_configurations, viz whop-checkout).
// deno-lint-ignore no-explicit-any
async function whopPostWithCompany(path: string, body: Record<string, unknown>): Promise<any> {
  const companyId = Deno.env.get("WHOP_COMPANY_ID");
  if (!companyId) throw new Error("WHOP_COMPANY_ID is not set");
  try {
    return await whopFetch(path, { method: "POST", body: { ...body, company_id: companyId } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/company_id/i.test(msg)) throw err;
    return await whopFetch(path, { method: "POST", body });
  }
}

// ---------- create ----------
// deno-lint-ignore no-explicit-any
async function createCode(supabase: any, body: any) {
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    return jsonResponse({ error: "Kód musí mít 3–20 znaků (A–Z, 0–9)." }, 400);
  }
  const planKey = String(body.planKey ?? "all");
  if (planKey !== "all" && !PACKAGES[planKey]) {
    return jsonResponse({ error: "Neznámý balíček." }, 400);
  }
  const discountPct = Number(body.discountPct);
  if (!Number.isFinite(discountPct) || discountPct <= 0 || discountPct > 100) {
    return jsonResponse({ error: "Sleva musí být 1–100 %." }, 400);
  }
  const commissionPct = Number(body.commissionPct);
  if (!Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 100) {
    return jsonResponse({ error: "Provize musí být 0–100 %." }, 400);
  }
  const usageLimit = body.usageLimit === null || body.usageLimit === undefined || body.usageLimit === ""
    ? null
    : Number(body.usageLimit);
  if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit <= 0)) {
    return jsonResponse({ error: "Limit použití musí být kladné celé číslo (nebo prázdný = bez limitu)." }, 400);
  }
  const ownerEmail = String(body.ownerEmail ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(ownerEmail)) {
    return jsonResponse({ error: "Zadejte platný e-mail vlastníka." }, 400);
  }

  // duplicita v naší tabulce (unikátní index to hlídá i tak, ale chceme hezkou hlášku)
  const { data: existing } = await supabase
    .from("affiliate_codes")
    .select("id")
    .ilike("code", code)
    .maybeSingle();
  if (existing) return jsonResponse({ error: `Kód ${code} už existuje.` }, 400);

  // Promo kód ve Whop. promo_type percentage → amount_off = procenta slevy,
  // stock = globální limit použití (unlimited_stock = bez limitu).
  // plan_ids: pouze když je pro balíček známé Whop plan id (env WHOP_PLAN_<KEY>);
  // inline plány se zakládají až při checkoutu, takže bez env id kód necháváme
  // pro všechny plány.
  const planId = planKey === "all" ? null : whopPlanId(planKey);
  const promo = await whopPostWithCompany("/promo_codes", {
    code,
    amount_off: discountPct,
    base_currency: "usd",
    promo_type: "percentage",
    new_users_only: false,
    one_per_customer: false,
    promo_duration_months: 0, // jednorázové plány — délka trvání slevy je irelevantní
    stock: usageLimit,
    unlimited_stock: usageLimit === null,
    plan_ids: planId ? [planId] : null,
  });

  // Affiliate záznam ve Whop (POST /affiliates "creates or finds") — best-effort:
  // vlastník nemusí mít Whop účet, provizi počítáme z vlastních dat, takže
  // případné selhání jen zalogujeme.
  try {
    await whopPostWithCompany("/affiliates", { user_identifier: ownerEmail });
  } catch (err) {
    console.error("affiliate záznam ve Whop se nepodařil (pokračuji bez něj):", err);
  }

  const { data: row, error } = await supabase
    .from("affiliate_codes")
    .insert({
      code,
      owner_email: ownerEmail,
      plan_key: planKey,
      discount_pct: discountPct,
      commission_pct: commissionPct,
      usage_limit: usageLimit,
      whop_promo_id: promo?.id ?? null,
      active: true,
    })
    .select()
    .single();
  if (error) throw error;

  return jsonResponse({ ok: true, code: row });
}

// ---------- list ----------
// deno-lint-ignore no-explicit-any
async function listCodes(supabase: any) {
  const [{ data: codes, error }, { data: promoPayments }] = await Promise.all([
    supabase.from("affiliate_codes").select("*").order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("promo_code")
      .eq("status", "succeeded")
      .not("promo_code", "is", null),
  ]);
  if (error) throw error;

  // počty použití z plateb (case-insensitive — Whop kód může mít jinou velikost)
  const usedByCode: Record<string, number> = {};
  for (const p of promoPayments ?? []) {
    const key = String(p.promo_code).toUpperCase();
    usedByCode[key] = (usedByCode[key] ?? 0) + 1;
  }

  // deno-lint-ignore no-explicit-any
  const rows = (codes ?? []).map((c: any) => ({
    ...c,
    used: usedByCode[String(c.code).toUpperCase()] ?? 0,
  }));
  return jsonResponse({ codes: rows });
}

// ---------- archive ----------
// deno-lint-ignore no-explicit-any
async function archiveCode(supabase: any, body: any) {
  const id = String(body.id ?? "");
  if (!id) return jsonResponse({ error: "Chybí id kódu." }, 400);

  const { data: row } = await supabase
    .from("affiliate_codes")
    .select("id, whop_promo_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return jsonResponse({ error: "Kód nenalezen." }, 404);

  // Whop kód archivuje DELETE (další checkouty ho nepoužijí). Když ve Whop
  // už neexistuje, jen to zalogujeme a vypneme ho aspoň u nás.
  if (row.whop_promo_id) {
    try {
      await whopFetch(`/promo_codes/${row.whop_promo_id}`, { method: "DELETE" });
    } catch (err) {
      console.error("Archivace promo kódu ve Whop selhala:", err);
    }
  }

  const { error } = await supabase
    .from("affiliate_codes")
    .update({ active: false })
    .eq("id", id);
  if (error) throw error;
  return jsonResponse({ ok: true });
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
    const body = await req.json().catch(() => ({}));
    const supabase = supabaseAdmin();

    switch (body.action) {
      case "create":
        return await createCode(supabase, body);
      case "list":
        return await listCodes(supabase);
      case "archive":
        return await archiveCode(supabase, body);
      default:
        return jsonResponse({ error: "Neznámá akce (create | list | archive)." }, 400);
    }
  } catch (err) {
    console.error("affiliate-manage error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Operace se nepodařila." },
      500,
    );
  }
});
