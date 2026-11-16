// Program „Pozvi kamaráda" (tabulky viz migrations/045_referrals.sql).
//
// • Kamarád, který přijde s kódem doporučitele (?ref=KÓD → js/whop.js ho uloží a pošle do
//   whop-checkout), má 10 % slevu na svůj první nákup.
// • Doporučitel za každého kamaráda, který opravdu zaplatil, dostane jeden voucher: 10 % sleva
//   na další balíček (i reset). Vouchery jsou jednorázové a nesčítají se — na jeden nákup max.
//   jeden. Žádné peníze, žádný kredit.
//
// Slevu vždy počítá server: whop-checkout ji promítne do ceny inline Whop plánu (stejná cesta
// jako zlevněný reset), klient ji jen zobrazuje. Veřejný kód NEWFUNDLY dál uplatňuje Whop
// standardně nad touto cenou (checkout.js ho posílá jako promoCode), takže se 10 % sčítá s ním.
//
// Soubor nemá žádné importy (čisté helpery + DB volání přes předaný klient), aby šel otestovat
// i v node --experimental-strip-types.

export const REFERRAL_DISCOUNT_PCT = 10;
export const REFERRAL_CODE_RE = /^[A-Z0-9]{4,16}$/;
// bez 0/O/1/I/L — kód se často opisuje ručně
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export type DiscountKind = "voucher" | "referral";
export type ReferralStatus = "applied" | "invalid" | "self" | "existing" | "used" | "voucher" | null;

export interface CheckoutDiscount {
  kind: DiscountKind;
  pct: number;
  voucherId?: string;
  attributionId?: string;
}

export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return REFERRAL_CODE_RE.test(code) ? code : null;
}

export function generateReferralCode(length = 7, random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return out;
}

// Cena po slevě v celých dolarech — stejné zaokrouhlení jako resetPrice() a js/referral.js.
export function discountedPrice(price: number, pct: number): number {
  return Math.round((price * (100 - pct)) / 100);
}

// Slevy z doporučení jen na challenge balíčky (vč. resetu), ne na aktivační poplatek.
export function discountEligiblePackage(key: string): boolean {
  return key !== "activation";
}

export function normEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

// pro .ilike() — e-mail s "_" nebo "%" nesmí fungovat jako zástupný znak
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

// ---------- whop-checkout: jaká sleva (pokud vůbec) se na tenhle nákup uplatní ----------
// Pořadí: nevyužitý voucher kupujícího (doporučitel) > sleva pozvaného kamaráda. Nikdy obojí.
// Při jakékoli chybě DB vrací "bez slevy" (fail closed) — volající ji obalí try/catch.
export async function resolveCheckoutDiscount(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  opts: { email: string; packageKey: string; referralCode?: unknown; isReset: boolean; ip?: string | null },
): Promise<{ discount: CheckoutDiscount | null; referralStatus: ReferralStatus }> {
  const email = normEmail(opts.email);
  if (!email || !discountEligiblePackage(opts.packageKey)) return { discount: null, referralStatus: null };

  // 1) voucher doporučitele (nejstarší nevyužitý)
  const { data: voucher, error: vErr } = await supabase
    .from("referral_vouchers")
    .select("id, discount_pct")
    .eq("owner_email", email)
    .is("used_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (vErr) throw vErr;
  const hasCode = opts.referralCode !== undefined && opts.referralCode !== null && opts.referralCode !== "";
  if (voucher) {
    return {
      discount: { kind: "voucher", pct: Number(voucher.discount_pct) || REFERRAL_DISCOUNT_PCT, voucherId: voucher.id },
      referralStatus: hasCode ? "voucher" : null,
    };
  }

  // 2) sleva pozvaného kamaráda
  if (!hasCode) return { discount: null, referralStatus: null };
  const code = normalizeReferralCode(opts.referralCode);
  if (!code) return { discount: null, referralStatus: "invalid" };
  // reset je vždy pro stávajícího zákazníka
  if (opts.isReset) return { discount: null, referralStatus: "existing" };

  const { data: owner, error: oErr } = await supabase
    .from("referral_codes")
    .select("user_id, email, active")
    .eq("code", code)
    .maybeSingle();
  if (oErr) throw oErr;
  if (!owner || !owner.active) return { discount: null, referralStatus: "invalid" };
  if (normEmail(owner.email) === email) return { discount: null, referralStatus: "self" };

  // jen nový zákazník: žádná dřívější úspěšná platba ani challenge účet na tenhle e-mail
  const like = escapeLike(email);
  const [{ data: paid, error: pErr }, { data: acc, error: aErr }] = await Promise.all([
    supabase.from("payments").select("id").ilike("email", like).eq("status", "succeeded").limit(1).maybeSingle(),
    supabase.from("challenge_accounts").select("id").ilike("email", like).limit(1).maybeSingle(),
  ]);
  if (pErr) throw pErr;
  if (aErr) throw aErr;
  if (paid || acc) return { discount: null, referralStatus: "existing" };

  // jedno doporučení na e-mail kupujícího: nezaplacený (pending) řádek se přepíše na
  // aktuální kód, zaplacený/zrušený už slevu nedá
  const row = {
    code,
    referrer_user_id: owner.user_id,
    package_key: opts.packageKey,
    checkout_ip: opts.ip ?? null,
    updated_at: new Date().toISOString(),
  };
  // deno-lint-ignore no-explicit-any
  const pendingUpdate = async (): Promise<any> => {
    const { data: existing, error } = await supabase
      .from("referral_attributions")
      .select("id, status")
      .eq("buyer_email", email)
      .maybeSingle();
    if (error) throw error;
    if (!existing) return undefined;
    if (existing.status !== "pending") return null;
    const { error: uErr } = await supabase.from("referral_attributions").update(row).eq("id", existing.id).eq("status", "pending");
    if (uErr) throw uErr;
    return existing.id;
  };

  let attributionId = await pendingUpdate();
  if (attributionId === null) return { discount: null, referralStatus: "used" };
  if (attributionId === undefined) {
    const { data: inserted, error: iErr } = await supabase
      .from("referral_attributions")
      .insert({ ...row, buyer_email: email, status: "pending" })
      .select("id")
      .single();
    if (iErr) {
      // souběh: mezitím vznikl řádek pro stejný e-mail (unikátní buyer_email)
      if (iErr.code !== "23505") throw iErr;
      attributionId = await pendingUpdate();
      if (!attributionId) return { discount: null, referralStatus: "used" };
    } else {
      attributionId = inserted.id;
    }
  }
  return {
    discount: { kind: "referral", pct: REFERRAL_DISCOUNT_PCT, attributionId: String(attributionId) },
    referralStatus: "applied",
  };
}

// ---------- whop-webhook: po úspěšné platbě ----------
// Idempotentní: voucher se spotřebuje jen jednou (used_at is null), doporučení se zaplatí jen
// z 'pending' a voucher za něj je unikátní podle attribution_id.
export async function applyPaidReferral(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  // deno-lint-ignore no-explicit-any
  opts: { paymentId: string; email: string; metadata: Record<string, any> },
): Promise<void> {
  const now = new Date().toISOString();
  const voucherId = opts.metadata.referral_voucher_id ? String(opts.metadata.referral_voucher_id) : null;
  const attributionId = opts.metadata.referral_attribution_id ? String(opts.metadata.referral_attribution_id) : null;

  if (voucherId) {
    const { data: used, error } = await supabase
      .from("referral_vouchers")
      .update({ used_at: now, used_payment_id: opts.paymentId })
      .eq("id", voucherId)
      .is("used_at", null)
      .select("id");
    if (error) throw error;
    if (!used || !used.length) {
      // dvě rozpracované platby se stejným voucherem — druhá prošla se slevou bez voucheru
      console.error(`referral: voucher ${voucherId} už byl využitý/zrušený, platba ${opts.paymentId}`);
    }
  }

  if (attributionId) {
    const { data: rows, error } = await supabase
      .from("referral_attributions")
      .update({ status: "paid", whop_payment_id: opts.paymentId, paid_at: now, updated_at: now })
      .eq("id", attributionId)
      .eq("status", "pending")
      .select("id, referrer_user_id, buyer_email");
    if (error) throw error;
    const att = rows && rows[0];
    if (!att) return; // už zaplacené (duplicitní doručení) nebo zrušené adminem

    const { data: owner, error: oErr } = await supabase
      .from("referral_codes")
      .select("email")
      .eq("user_id", att.referrer_user_id)
      .maybeSingle();
    if (oErr) throw oErr;
    const ownerEmail = normEmail(owner?.email);
    // pojistka proti doporučení sebe sama (checkout to odmítá už předem)
    if (!ownerEmail || ownerEmail === normEmail(opts.email) || ownerEmail === normEmail(att.buyer_email)) {
      await supabase.from("referral_attributions").update({ status: "cancelled", updated_at: now }).eq("id", att.id);
      console.error(`referral: doporučení ${att.id} zrušeno (sám sebe / chybí vlastník)`);
      return;
    }
    const { error: vErr } = await supabase
      .from("referral_vouchers")
      .upsert(
        { user_id: att.referrer_user_id, owner_email: ownerEmail, attribution_id: att.id, discount_pct: REFERRAL_DISCOUNT_PCT },
        { onConflict: "attribution_id", ignoreDuplicates: true },
      );
    if (vErr) throw vErr;
  }
}

// ---------- whop-webhook: refundace platby kamaráda → doporučení zrušit, nevyužitý voucher stáhnout ----------
// deno-lint-ignore no-explicit-any
export async function revokeReferralForPayment(supabase: any, paymentId: string): Promise<void> {
  const now = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from("referral_attributions")
    .update({ status: "cancelled", updated_at: now })
    .eq("whop_payment_id", paymentId)
    .eq("status", "paid")
    .select("id");
  if (error) throw error;
  for (const r of rows ?? []) {
    await supabase
      .from("referral_vouchers")
      .update({ revoked_at: now })
      .eq("attribution_id", r.id)
      .is("used_at", null)
      .is("revoked_at", null);
  }
}

// ---------- referral-get: kód hráče (založí ho při prvním otevření) ----------
export async function getOrCreateReferralCode(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  user: { id: string; email: string },
): Promise<{ code: string; active: boolean }> {
  const email = normEmail(user.email);
  const { data: existing, error } = await supabase
    .from("referral_codes")
    .select("code, email, active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (existing) {
    // hráč si mezitím změnil e-mail → checkout páruje vouchery podle e-mailu, srovnat
    if (normEmail(existing.email) !== email) {
      await supabase.from("referral_codes").update({ email }).eq("user_id", user.id);
      await supabase.from("referral_vouchers").update({ owner_email: email }).eq("user_id", user.id).is("used_at", null);
    }
    return { code: existing.code, active: !!existing.active };
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateReferralCode(attempt < 3 ? 7 : 9);
    const { data: row, error: iErr } = await supabase
      .from("referral_codes")
      .insert({ user_id: user.id, code, email })
      .select("code, active")
      .single();
    if (!iErr) return { code: row.code, active: !!row.active };
    if (iErr.code !== "23505") throw iErr;
    // kolize: buď kód (zkusit jiný), nebo user_id (souběžné první otevření) → přečíst
    const { data: again } = await supabase.from("referral_codes").select("code, active").eq("user_id", user.id).maybeSingle();
    if (again) return { code: again.code, active: !!again.active };
  }
  throw new Error("Could not create a referral code.");
}
