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
