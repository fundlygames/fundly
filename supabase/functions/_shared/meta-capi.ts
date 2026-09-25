// _shared/meta-capi.ts — Meta Conversions API (server-side, authoritative Purchase event).
// Bez META_CAPI_ACCESS_TOKEN / META_PIXEL_ID (secrets set) tiše přeskočí — nic to neblokuje,
// stejný vzor jako _shared/email.ts.
// Nastavení: supabase secrets set META_PIXEL_ID=... META_CAPI_ACCESS_TOKEN=...
// (volitelně META_TEST_EVENT_CODE=TESTxxxxx — události se pak ukážou v Events Manager
// > Test events místo ostrých dat, na ověření).
// Proč server-side a ne jen klientský pixel: Purchase se potvrzuje až webhookem od Whopu
// (jediný autoritativní zdroj), navíc to nejde blokovat ad-blockerem na klientovi.
//
// Aby Meta prodej přiřadila reklamě (a ne jen "někdo koupil"), musí událost nést
// action_source "website" + fbp/fbc (cookie pixelu / kliknutí z reklamy) + user agent
// a IP. Dřív šlo jen o hashovaný e-mail s action_source "system_generated", takže se
// nenapárovala na kliknutí a kampaň měla v Ads Manageru nula výsledků.

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
  contentId?: string;
  clientIp?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  sourceUrl?: string | null;
}): Promise<{ sent: boolean; error?: string; detail?: string }> {
  const pixelId = Deno.env.get("META_PIXEL_ID");
  const accessToken = Deno.env.get("META_CAPI_ACCESS_TOKEN");
  if (!pixelId || !accessToken) return { sent: false, error: "META_PIXEL_ID/META_CAPI_ACCESS_TOKEN not set" };

  try {
    const emHash = await sha256Hex(params.email.trim().toLowerCase());
    const userData: Record<string, unknown> = { em: [emHash], external_id: [emHash] };
    if (params.clientIp) userData.client_ip_address = params.clientIp;
    if (params.userAgent) userData.client_user_agent = params.userAgent;
    if (params.fbp) userData.fbp = params.fbp;
    if (params.fbc) userData.fbc = params.fbc;

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: params.eventId,
          action_source: "website",
          ...(params.sourceUrl ? { event_source_url: params.sourceUrl } : {}),
          user_data: userData,
          custom_data: {
            currency: (params.currency ?? "USD").toUpperCase(),
            value: Number(params.value) || 0,
            content_name: params.contentName,
            content_type: "product",
            ...(params.contentId ? { content_ids: [params.contentId] } : {}),
          },
        },
      ],
    };
    const testCode = Deno.env.get("META_TEST_EVENT_CODE");
    if (testCode) payload.test_event_code = testCode;

    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${pixelId}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return { sent: false, error: `Meta CAPI HTTP ${res.status}: ${text}` };
    }
    return { sent: true, detail: text.slice(0, 300) };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
