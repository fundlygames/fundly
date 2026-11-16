// whop-webhook — přijímá Whop webhooky (Standard Webhooks spec) a zapisuje
// platby + challenge účty. Ověřuje HMAC-SHA256 podpis z WHOP_WEBHOOK_SECRET.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { packageByKey } from "../_shared/packages.ts";
import { whopFetch, mapKycStatus, extractPaymentFingerprint } from "../_shared/whop.ts";
import { sendPurchaseEvent } from "../_shared/meta-capi.ts";
import { markRedeemed } from "../_shared/capacity.ts";
import { sendEmail, purchaseConfirmedHtml, subjects } from "../_shared/email.ts";
import { userLang } from "../_shared/user-lang.ts";
import { secureUserForPurchase } from "../_shared/mailbox.ts";
import { applyPaidReferral, revokeReferralForPayment } from "../_shared/referral.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://fundly.games";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Možné derivace HMAC klíče ze secretu — Whop vrací secret buď jako
// whsec_<base64> (Standard Webhooks) nebo ws_<hex> (viz create-webhook response).
function keyCandidates(secret: string): Uint8Array[] {
  const out: Uint8Array[] = [new TextEncoder().encode(secret)];
  if (secret.startsWith("whsec_")) {
    try { out.push(base64ToBytes(secret.slice(6))); } catch { /* ignore */ }
  }
  if (secret.startsWith("ws_")) {
    const hex = secret.slice(3);
    if (/^[0-9a-f]+$/i.test(hex) && hex.length % 2 === 0) out.push(hexToBytes(hex));
  }
  return out;
}

// Standard Webhooks: podpis = base64(HMAC_SHA256(key, "id.timestamp.rawBody")),
// hlavička webhook-signature obsahuje "v1,<base64>" (případně více podpisů).
async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get("WHOP_WEBHOOK_SECRET") ?? "";
  const id = req.headers.get("webhook-id");
  const timestamp = req.headers.get("webhook-timestamp");
  const signatureHeader = req.headers.get("webhook-signature");
  if (!secret || !id || !timestamp || !signatureHeader) return false;

  // replay ochrana: timestamp nesmí být starší než 5 minut
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  // zkusíme všechny derivace klíče (ws_<hex>, whsec_<base64>, raw)
  const signatures = signatureHeader
    .split(" ")
    .map((part) => part.split(","))
    .filter(([version]) => version === "v1")
    .map(([, value]) => value ?? "");

  for (const keyBytes of keyCandidates(secret)) {
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signed = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`),
    );
    const expected = bytesToBase64(new Uint8Array(signed));
    if (signatures.some((value) => timingSafeEqual(value, expected))) return true;
  }
  return false;
}

// deno-lint-ignore no-explicit-any
function supabaseAdmin(): any {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// deno-lint-ignore no-explicit-any
async function findExistingUser(supabase: any, email: string) {
  const target = email.toLowerCase();
  // listUsers() is paginated (1000/page) — most checkout customers already
  // have an auth user from the sign-up step (js/checkout.js), created well
  // before this webhook fires, so this ALWAYS has to search every page, not
  // just the first, once the project has more than 1000 total users, or the
  // match silently fails for a real existing customer and the code below
  // creates a second, duplicate, PASSWORDLESS account instead of linking to
  // the one whose password the customer actually set at checkout.
  for (let page = 1; page <= 50; page++) {
    // deno-lint-ignore no-explicit-any
    const { data: list, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    // deno-lint-ignore no-explicit-any
    const hit = list?.users?.find((u: any) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (!list?.users || list.users.length < 1000) break; // last page
  }
  return null;
}

// Najde nebo založí auth uživatele podle e-mailu. VŽDY hledá existujícího
// uživatele JAKO PRVNÍ — checkout signup (js/checkout.js) zakládá auth účet
// s heslem dřív, než tahle funkce vůbec doběhne, takže "rovnou založit" by
// jen náhodou trefilo tu samou e-mailovou kolizi (createUser pak selže) a
// jindy (viz findExistingUser pozn.) by tiše vytvořilo DRUHÝ, bezheslový
// účet — zákazník by se pak vlastním heslem z checkoutu nikdy nedostal na
// svůj zaplacený challenge_accounts řádek (RLS je striktně auth.uid() =
// user_id, žádná shoda e-mailu nestačí). Založení nového účtu je fallback
// jen pro nákupy mimo náš checkout (přímý Whop odkaz) — pak přihlášení
// probíhá magic linkem, viz e-mail níže.
async function findOrCreateUser(supabase: any, email: string) {
  const existing = await findExistingUser(supabase, email);
  if (existing) return existing;

  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (!error && created?.user) return created.user;

  // createUser selhal a existující účet jsme taky nenašli (race — mezitím
  // vznikl) — poslední pokus.
  return await findExistingUser(supabase, email);
}

// „Payment confirmed" e-mail: šablona je purchaseConfirmedHtml v _shared/email.ts (en/cs).

// deno-lint-ignore no-explicit-any
async function insertPayment(supabase: any, data: any, status: string) {
  // idempotence: webhook se může doručit vícekrát (at-least-once)
  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("whop_payment_id", data.id)
    .maybeSingle();
  if (existing) return false;

  const metadata = data.metadata ?? {};
  const email = data.user?.email ?? metadata.email ?? null;

  // Promo kód: platební objekt Whop nese promo_code { code, amount_off, ... }.
  // Čteme defenzivně i z metadat pro případ jiného tvaru payloadu.
  const promoCode = data.promo_code?.code ?? metadata.promo_code ?? null;

  // Affiliate = vlastník promo kódu: případně z metadat, jinak dohledáme
  // v affiliate_codes podle kódu (case-insensitive).
  let affiliate = metadata.affiliate ?? metadata.affiliate_code ?? null;
  if (!affiliate && promoCode) {
    try {
      const { data: ac } = await supabase
        .from("affiliate_codes")
        .select("owner_email")
        .ilike("code", String(promoCode))
        .maybeSingle();
      affiliate = ac?.owner_email ?? null;
    } catch (e) {
      // tabulka affiliate_codes nemusí ještě existovat — promo kód uložíme i tak
      console.error("affiliate lookup selhal:", e);
    }
  }

  await supabase.from("payments").insert({
    whop_payment_id: data.id,
    email,
    package_key: metadata.package_key ?? null,
    amount: data.total ?? data.amount_after_fees ?? data.subtotal ?? null,
    currency: data.currency ?? null,
    status,
    promo_code: promoCode,
    affiliate,
    checkout_ip: metadata.checkout_ip ?? null,
    payment_fingerprint: extractPaymentFingerprint(data),
    whop_metadata: data, // kompletní payload (whop-payout z něj čte user.id)
  });
  return true;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  if (!(await verifySignature(req, rawBody))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const supabase = supabaseAdmin();
  // deno-lint-ignore no-explicit-any
  const data = (event.data ?? {}) as any;

  try {
    switch (event.type) {
      case "payment.succeeded": {
        const inserted = await insertPayment(supabase, data, "succeeded");
        if (!inserted) break; // duplicitní doručení

        const metadata = data.metadata ?? {};
        const email = data.user?.email ?? metadata.email;
        const pkg = packageByKey(String(metadata.package_key ?? ""));
        if (!email || !pkg) {
          console.error("payment.succeeded bez e-mailu/balíčku:", data.id);
          break;
        }

        // „Pozvi kamaráda": spotřebovat použitý voucher / zaplatit doporučení a vystavit
        // doporučiteli voucher (idempotentní, viz _shared/referral.ts). Best-effort — chyba
        // nesmí zablokovat založení zaplaceného účtu níž.
        if (metadata.referral_voucher_id || metadata.referral_attribution_id) {
          try {
            await applyPaidReferral(supabase, { paymentId: String(data.id), email: String(email), metadata });
          } catch (e) {
            console.error("referral zpracování selhalo:", data.id, e);
          }
        }

        // Meta Conversions API — autoritativní Purchase event (server-side, nejde
        // obejít ad-blockerem). Best-effort, na chybu se platba nečeká.
        // Stejné ID nákupu, které poslal prohlížeč (fbq Purchase po návratu z platby),
        // aby je Meta spojila do jednoho; bez něj (starší checkout) ID platby.
        const metaEventId = String(metadata.meta_event_id ?? data.id);
        sendPurchaseEvent({
          email: String(email),
          value: Number(data.total ?? data.amount_after_fees ?? data.subtotal ?? 0),
          currency: data.currency ? String(data.currency) : "USD",
          eventId: metaEventId,
          contentName: pkg.name,
          contentId: pkg.key,
          clientIp: metadata.checkout_ip ?? null,
          userAgent: metadata.meta_ua ?? null,
          fbp: metadata.meta_fbp ?? null,
          fbc: metadata.meta_fbc ?? null,
          sourceUrl: metadata.meta_url ?? `${SITE_URL}/checkout`,
        }).then(async (r) => {
          if (!r.sent) console.error("Meta CAPI Purchase selhal:", r.error);
          else console.log("Meta CAPI Purchase odeslán:", r.detail);
          // výsledek zapsat k platbě — jde ověřit SQL dotazem, bez logů
          try {
            await supabase
              .from("payments")
              .update({
                meta_capi_status: r.sent ? "sent" : `failed: ${String(r.error).slice(0, 200)}`,
                meta_event_id: metaEventId,
              })
              .eq("whop_payment_id", data.id);
          } catch (e) {
            console.error("meta_capi_status se nepodařilo zapsat:", e);
          }
        }).catch((e) => console.error("Meta CAPI Purchase error:", e));

        // Pokud šlo o pozvaného z waitlistu, označíme pozvánku jako vyčerpanou
        // (best-effort, no-op pro e-maily bez waitlist záznamu).
        if (pkg.key !== "activation") {
          markRedeemed(supabase, String(email)).catch((e) =>
            console.error("waitlist markRedeemed error:", e)
          );
        }

        // Aktivační poplatek funded účtu: nezakládáme nový challenge účet,
        // jen na nejnovější funded účet hráče připneme flag "activation_paid".
        if (pkg.key === "activation") {
          const { data: fundedAcc } = await supabase
            .from("challenge_accounts")
            .select("id, flags")
            .eq("email", String(email))
            .eq("state", "funded")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (fundedAcc) {
            const flags = Array.isArray(fundedAcc.flags) ? fundedAcc.flags : [];
            if (!flags.includes("activation_paid")) flags.push("activation_paid");
            await supabase
              .from("challenge_accounts")
              .update({ flags })
              .eq("id", fundedAcc.id);
          } else {
            console.error("activation payment bez funded účtu:", email);
          }
          break;
        }

        const user = await findOrCreateUser(supabase, String(email));
        // Účet s touhle adresou mohl předem založit kdokoli (e-mail se při registraci neověřuje).
        // Neověřenému, ne-čerstvému účtu změníme heslo a zahodíme relace — dovnitř se dostane jen
        // majitel schránky přes odkaz z e-mailu níže (viz _shared/mailbox.ts).
        if (user) {
          const access = await secureUserForPurchase(supabase, user);
          if (access === "reset" || access === "reset_failed") {
            console.error(`whop-webhook MAILBOX_UNVERIFIED: ${access} pro uživatele ${user.id} (účet vznikl ${user.created_at}, nákup ${data.id})`);
          }
        }
        // phase_started_at musí být přesně tenhle okamžik (skutečný nákup),
        // ne kdykoli klient poprvé otevře dashboard a sám si spustí lokální
        // 30denní odpočet: bez tohohle sloupec zůstával NULL, dokud
        // nedoběhl první sync-account, takže hráč, co si dashboard otevřel
        // až o pár dní později, dostal 30denní okno posunuté o tyhle dny
        // navíc (reálně nahlášeno 21.9.).
        await supabase.from("challenge_accounts").insert({
          user_id: user?.id ?? null,
          email: String(email),
          package_key: pkg.key,
          phase: 1,
          capital: pkg.cap,
          state: "active",
          signup_ip: metadata.checkout_ip ?? null,
          payment_fingerprint: extractPaymentFingerprint(data),
          phase_started_at: new Date().toISOString(),
        });

        // Reset po spálení: starý spálený účet dostane flag "reset_used", aby se
        // zlevněný reset nedal použít opakovaně na ten samý účet.
        if (metadata.reset_account_id) {
          try {
            const { data: old } = await supabase
              .from("challenge_accounts")
              .select("flags")
              .eq("id", String(metadata.reset_account_id))
              .maybeSingle();
            const oldFlags = Array.isArray(old?.flags) ? old.flags : [];
            if (!oldFlags.includes("reset_used")) {
              await supabase
                .from("challenge_accounts")
                .update({ flags: [...oldFlags, "reset_used"] })
                .eq("id", String(metadata.reset_account_id));
            }
          } catch (e) {
            console.error("reset_used flag se nepodařilo zapsat:", e);
          }
        }

        // „Payment confirmed" e-mail s přístupem do účtu. generateLink() sama
        // o sobě nic neposílá (jen vygeneruje token) — proto vlastní odkaz
        // (action_link) vložíme do vlastního Resend e-mailu. Bez magic linku
        // (chyba/rate limit) pošleme aspoň prostý odkaz na dashboard — účet
        // z checkout signupu už má vlastní heslo, takže se stejně přihlásí.
        // waitUntil (viz sync-account) — doběhne na pozadí po odeslání
        // odpovědi Whopu, bez blokování webhooku; bez waitUntil fire-and-forget.
        const emailWork = (async () => {
          let accessLink = `${SITE_URL}/dashboard`;
          try {
            const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
              type: "magiclink",
              email: String(email),
            });
            if (linkError) throw linkError;
            if (linkData?.properties?.action_link) accessLink = linkData.properties.action_link;
          } catch (e) {
            console.error("magiclink generování selhalo, posílám prostý dashboard odkaz:", e);
          }
          // jazyk podle auth účtu kupujícího (user_metadata.lang / checkout_lang), jinak doména e-mailu
          const lang = await userLang(supabase, { user, email: String(email) });
          const result = await sendEmail({
            to: String(email),
            subject: subjects.purchaseConfirmed(lang),
            html: purchaseConfirmedHtml(pkg, accessLink, {
              id: String(data.id ?? "—"),
              // Stejný výpočet jako insertPayment() výše — skutečně
              // strhnutá částka (po promo kódu), ne katalogová cena.
              amount: Number(data.total ?? data.amount_after_fees ?? data.subtotal ?? pkg.price),
              currency: String(data.currency ?? "USD").toUpperCase(),
              promoCode: data.promo_code?.code ?? metadata.promo_code ?? null,
              purchasedAt: new Date(),
            }, lang, SITE_URL),
          });
          if (!result.sent) console.error("purchase e-mail selhal:", result.error);
        })().catch((e) => console.error("purchase e-mail handler error:", e));
        // deno-lint-ignore no-explicit-any
        const edgeRuntime = (globalThis as any).EdgeRuntime;
        if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(emailWork);
        break;
      }

      case "payment.failed": {
        await insertPayment(supabase, data, "failed");
        break;
      }

      // Refundace platby pozvaného kamaráda → doporučení se zruší a nevyužitý voucher
      // doporučitele stáhne. Tvar payloadu se mezi verzemi Whop API liší, id platby čteme
      // defenzivně (refund objekt nese payment, payment.refunded je platba sama).
      case "refund.created":
      case "payment.refunded": {
        const paymentId = data.payment?.id ?? data.payment_id ?? (event.type === "payment.refunded" ? data.id : null);
        if (paymentId) {
          try {
            await revokeReferralForPayment(supabase, String(paymentId));
          } catch (e) {
            console.error("referral revoke selhal:", paymentId, e);
          }
        }
        break;
      }

      // aktuální Whop dokumentace uvádí i membership.activated/deactivated,
      // proto zpracováváme obě pojmenování
      case "membership.went_valid":
      case "membership.activated":
      case "membership.went_invalid":
      case "membership.deactivated": {
        const state =
          event.type === "membership.went_valid" ||
            event.type === "membership.activated"
            ? "active"
            : "cancelled";
        const email = data.user?.email ?? data.metadata?.email;
        if (email) {
          await supabase
            .from("challenge_accounts")
            .update({ state })
            .eq("email", String(email));
        }
        break;
      }

      // KYC: ověření identity přes Whop Verification. Podle dokumentace
      // (docs.whop.com/developer/verification) webhook identity_profile.updated
      // hlásí ZMĚNU profilu, ne jeho nový stav — ten případně dočteme z
      // GET /verifications?account_id=biz_... podle id profilu z payloadu.
      case "identity_profile.updated":
      case "identity_profile.approved":
      case "identity_profile.rejected":
      case "verification.succeeded": {
        const email = data.user?.email ?? data.email ?? data.metadata?.email ?? null;
        const rawStatus = data.status ?? data.review_status ?? data.result ?? null;
        let kyc = rawStatus ? mapKycStatus(String(rawStatus)) : "unknown";

        if (!rawStatus && data.id) {
          // payload stav nenese → dočteme ho z Whop API
          try {
            const companyId = Deno.env.get("WHOP_COMPANY_ID");
            // deno-lint-ignore no-explicit-any
            const list: any = await whopFetch(`/verifications?account_id=${companyId}`);
            const items = list?.data ?? list?.verifications ?? [];
            // deno-lint-ignore no-explicit-any
            const prof = items.find((v: any) => v.id === data.id);
            if (prof?.status) kyc = mapKycStatus(String(prof.status));
          } catch (e) {
            console.error("KYC stav se nepodařilo dočíst:", e);
          }
        }

        if (email) {
          await supabase
            .from("challenge_accounts")
            .update({ kyc_status: kyc })
            .eq("email", String(email));
        } else {
          console.error("KYC webhook bez e-mailu:", event.type, data.id);
        }
        break;
      }

      default:
        // neznámé eventy potvrdíme, aby se neopakovaly retry pokusy
        break;
    }
  } catch (err) {
    console.error("whop-webhook error:", event.type, err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
});
