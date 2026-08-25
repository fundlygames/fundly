// _shared/meta-capi.ts — Meta Conversions API (server-side, authoritative Purchase event).
// Bez META_CAPI_ACCESS_TOKEN / META_PIXEL_ID (secrets set) tiše přeskočí — nic to neblokuje,
// stejný vzor jako _shared/email.ts.
// Nastavení: supabase secrets set META_PIXEL_ID=... META_CAPI_ACCESS_TOKEN=...
// Proč server-side a ne jen klientský pixel: Purchase se potvrzuje až webhookem od Whopu
// (jediný autoritativní zdroj), navíc to nejde blokovat ad-blockerem na klientovi.

const API_VERSION = "v21.0";

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sendPurchaseEvent(params: {
  email: string;
  value: number;
  currency?: string;
  eventId: string;
  contentName?: string;
  clientIp?: string | null;
}): Promise<{ sent: boolean; error?: string }> {
  const pixelId = Deno.env.get("META_PIXEL_ID");
  const accessToken = Deno.env.get("META_CAPI_ACCESS_TOKEN");
  if (!pixelId || !accessToken) return { sent: false, error: "META_PIXEL_ID/META_CAPI_ACCESS_TOKEN not set" };

  try {
    const emHash = await sha256Hex(params.email.trim().toLowerCase());
    const userData: Record<string, unknown> = { em: [emHash] };
    if (params.clientIp) userData.client_ip_address = params.clientIp;

    const payload = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: params.eventId,
          action_source: "system_generated",
          user_data: userData,
          custom_data: {
            currency: params.currency ?? "USD",
            value: String(params.value),
            content_name: params.contentName,
          },
        },
      ],
    };

    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${pixelId}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, error: `Meta CAPI HTTP ${res.status}: ${body}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
