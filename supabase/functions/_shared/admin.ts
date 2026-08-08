// Ověření admin přístupu: buď sdílené tajemství (x-admin-key), nebo
// uživatelský JWT člena tabulky admin_users.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Je uživatel (podle JWT) v tabulce admin_users?
async function isAdminUser(token: string): Promise<boolean> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: userData, error } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (error || !user) return false;
  const { data: row } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return !!row;
}

// Hlavní helper pro admin edge funkce: projde admin klíč NEBO JWT admina.
export async function isAdminRequest(req: Request): Promise<boolean> {
  if (await isValidAdminKey(req)) return true;
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return false;
  try {
    return await isAdminUser(token);
  } catch (e) {
    console.error("isAdminRequest error:", e);
    return false;
  }
}
