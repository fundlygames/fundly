// whop-webhook — přijímá Whop webhooky (Standard Webhooks spec) a zapisuje
// platby + challenge účty. Ověřuje HMAC-SHA256 podpis z WHOP_WEBHOOK_SECRET.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { packageByKey } from "../_shared/packages.ts";

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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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

  // secret ve formátu whsec_... → prefix se odstraní a zbytek je base64 klíč
  const keyBytes = secret.startsWith("whsec_")
    ? base64ToBytes(secret.slice("whsec_".length))
    : new TextEncoder().encode(secret);

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

  return signatureHeader.split(" ").some((part) => {
    const [version, value] = part.split(",");
    return version === "v1" && timingSafeEqual(value ?? "", expected);
  });
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
  await supabase.from("payments").insert({
    whop_payment_id: data.id,
    email,
    package_key: metadata.package_key ?? null,
    amount: data.total ?? data.amount_after_fees ?? data.subtotal ?? null,
    currency: data.currency ?? null,
    status,
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

        const user = await findOrCreateUser(supabase, String(email));
        await supabase.from("challenge_accounts").insert({
          user_id: user?.id ?? null,
          email: String(email),
          package_key: pkg.key,
          phase: 1,
          capital: pkg.cap,
          state: "active",
        });
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
