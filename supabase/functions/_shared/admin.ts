// Ověření sdíleného admin tajemství (x-admin-key) s timing-safe porovnáním.

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return new Uint8Array(digest);
}

// Porovnání přes SHA-256 hashe, aby délka tajemství neprozrázala obsah
// a porovnání běželo konstantní dobu.
export async function isValidAdminKey(req: Request): Promise<boolean> {
  const expected = Deno.env.get("ADMIN_API_KEY") ?? "";
  const provided = req.headers.get("x-admin-key") ?? "";
  if (!expected || !provided) return false;

  const [a, b] = await Promise.all([sha256(expected), sha256(provided)]);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
