// whop-webhook — přijímá Whop webhooky (Standard Webhooks spec) a zapisuje
// platby + challenge účty. Ověřuje HMAC-SHA256 podpis z WHOP_WEBHOOK_SECRET.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { packageByKey } from "../_shared/packages.ts";
import { whopFetch, mapKycStatus, extractPaymentFingerprint } from "../_shared/whop.ts";
import { sendPurchaseEvent } from "../_shared/meta-capi.ts";
import { markRedeemed } from "../_shared/capacity.ts";

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

// Najde nebo založí auth uživatele podle e-mailu (heslo neřešíme,
// přihlášení probíhá magic linkem).
// deno-lint-ignore no-explicit-any
async function findOrCreateUser(supabase: any, email: string) {
  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (!error && created?.user) return created.user;

  // už existuje → dohledáme ho podle e-mailu
  const { data: list } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  return (
    list?.users?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase(),
    ) ?? null
  );
}

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

        // Meta Conversions API — autoritativní Purchase event (server-side, nejde
        // obejít ad-blockerem). Best-effort, na chybu se platba nečeká.
        sendPurchaseEvent({
          email: String(email),
          value: Number(data.total ?? data.amount_after_fees ?? data.subtotal ?? 0),
          currency: data.currency ? String(data.currency) : "USD",
          eventId: String(data.id),
          contentName: pkg.name,
          clientIp: metadata.checkout_ip ?? null,
        }).then((r) => {
          if (!r.sent) console.error("Meta CAPI Purchase selhal:", r.error);
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
        await supabase.from("challenge_accounts").insert({
          user_id: user?.id ?? null,
          email: String(email),
          package_key: pkg.key,
          phase: 1,
          capital: pkg.cap,
          state: "active",
          signup_ip: metadata.checkout_ip ?? null,
          payment_fingerprint: extractPaymentFingerprint(data),
        });

        // „Účet je připraven" e-mail: magic link přes Supabase admin API.
        // Free email rate limit je těsný → try/catch + log, platbu to neblokuje.
        try {
          await supabase.auth.admin.generateLink({
            type: "magiclink",
            email: String(email),
          });
        } catch (e) {
          console.error("magiclink e-mail po koupi selhal:", e);
        }
        break;
      }

      case "payment.failed": {
        await insertPayment(supabase, data, "failed");
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
