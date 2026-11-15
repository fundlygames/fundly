// _shared/unsubscribe.ts — podepsaný odkaz na odhlášení z marketingových e-mailů.
// Token = HMAC-SHA256(email, secret) — nejde uhodnout cizí e-mail a odhlásit ho.
// Secret: UNSUBSCRIBE_SECRET (fallback CRON_SECRET, který už existuje).

function secret(): string {
  return Deno.env.get("UNSUBSCRIBE_SECRET") ?? Deno.env.get("CRON_SECRET") ?? "";
}

export async function unsubscribeToken(email: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email.trim().toLowerCase()));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function unsubscribeUrl(siteUrl: string, email: string): Promise<string> {
  const e = email.trim().toLowerCase();
  return `${siteUrl}/unsubscribe.html?e=${encodeURIComponent(e)}&t=${await unsubscribeToken(e)}`;
}

// Odhlášení jen z týdenního reportu (weekly-report): vlastní token (HMAC "weekly:<email>"),
// takže odkaz z propagačního e-mailu neodhlásí report a naopak. Stránka unsubscribe.html
// pozná druh podle &type=weekly a pošle ho do email-unsubscribe.
export function weeklyUnsubscribeToken(email: string): Promise<string> {
  return unsubscribeToken(`weekly:${email.trim().toLowerCase()}`);
}

export async function weeklyUnsubscribeUrl(siteUrl: string, email: string): Promise<string> {
  const e = email.trim().toLowerCase();
  return `${siteUrl}/unsubscribe.html?e=${encodeURIComponent(e)}&t=${await weeklyUnsubscribeToken(e)}&type=weekly`;
}
