// Tenký fetch wrapper nad Whop REST API (https://api.whop.com/api/v1).
// API klíč je pouze v Supabase secrets, nikdy ne v klientském JS.

const WHOP_API_BASE = "https://api.whop.com/api/v1";

export async function whopFetch(
  path: string,
  options: { method?: string; body?: unknown } = {},
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  const apiKey = Deno.env.get("WHOP_API_KEY");
  if (!apiKey) throw new Error("WHOP_API_KEY is not set");

  const res = await fetch(`${WHOP_API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data && (data.message || data.error)) || `Whop API HTTP ${res.status}`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return data;
}

// Otisk platební metody z Whop payment payloadu (pro risk-scoring
// SHARED_PAYMENT_METHOD napříč účty). Whop payload tvar pro kartu není
// pevně zdokumentovaný napříč verzemi API, čteme proto defenzivně z
// několika možných cest; když nic nesedí, vrátíme null (flag se přeskočí).
// deno-lint-ignore no-explicit-any
export function extractPaymentFingerprint(data: any): string | null {
  const card = data?.card ?? data?.payment_method?.card ?? data?.charge?.card ?? null;
  if (card?.fingerprint) return `fp:${card.fingerprint}`;
  if (card?.last4 && (card?.brand || card?.exp_month)) {
    return `card:${card.brand ?? "?"}:${card.last4}:${card.exp_month ?? "?"}:${card.exp_year ?? "?"}`;
  }
  const pm = data?.payment_method_id ?? data?.payment_method?.id ?? null;
  if (pm) return `pm:${pm}`;
  return null;
}

// Mapování stavu Whop identity profilu na náš kyc_status
// ('verified' | 'failed' | 'unknown') — sdílené webhook ↔ payout.
export function mapKycStatus(status: string): string {
  const s = status.toLowerCase();
  if (["approved", "verified", "succeeded", "passed"].includes(s)) return "verified";
  if (["rejected", "failed", "declined"].includes(s)) return "failed";
  return "unknown";
}
