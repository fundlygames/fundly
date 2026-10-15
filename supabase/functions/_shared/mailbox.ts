// _shared/mailbox.ts — ověření, že účet opravdu patří majiteli e-mailové schránky.
//
// Problém: účet se zakládá bez ověření e-mailu (autoconfirm, checkout signUp, preview-signup).
// Kdo předem založil účet s CIZÍ adresou a vlastním heslem, ovládl by později zaplacený
// challenge, který whop-webhook připíná k existujícímu auth uživateli podle e-mailu.
//
// Řešení bez tření před platbou: uživatel je "ověřený" (app_metadata.mailbox_proven), jakmile se
// někdy přihlásil odkazem/kódem z e-mailu (JWT.amr obsahuje otp/magiclink/recovery) — to dokáže
// jen majitel schránky. Při NÁKUPU whop-webhook neověřenému účtu, který nevznikl těsně před
// platbou (= není to čerstvá registrace téhož kupujícího), změní heslo a zahodí relace; přístup
// pak vede jen přes magic link z "Payment confirmed" e-mailu.

export const FRESH_SIGNUP_MS = 20 * 60 * 1000;
const PROOF_METHODS = ["otp", "magiclink", "recovery", "invite"];

// deno-lint-ignore no-explicit-any
function jwtPayload(token: string): any | null {
  try {
    const part = token.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Token (už ověřený přes auth.getUser) vznikl přihlášením odkazem/kódem z e-mailu?
export function jwtProvesMailbox(token: string): boolean {
  const amr = jwtPayload(token)?.amr;
  return Array.isArray(amr) && amr.some((a: { method?: string }) => PROOF_METHODS.includes(String(a?.method)));
}

// deno-lint-ignore no-explicit-any
export function isMailboxProven(user: any): boolean {
  return user?.app_metadata?.mailbox_proven === true;
}

// Zapíše "ověřeno", pokud právě použitý token dokazuje vlastnictví schránky. Best-effort.
// deno-lint-ignore no-explicit-any
export async function markMailboxProven(supabase: any, user: any, token: string): Promise<void> {
  try {
    if (!user?.id || isMailboxProven(user) || !jwtProvesMailbox(token)) return;
    await supabase.auth.admin.updateUserById(user.id, {
      app_metadata: { ...(user.app_metadata ?? {}), mailbox_proven: true },
    });
  } catch (e) {
    console.error("markMailboxProven:", e);
  }
}

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type PurchaseAccessAction = "proven" | "fresh" | "reset" | "reset_failed";

// Voláno při nákupu pro už existujícího auth uživatele s e-mailem kupujícího.
// deno-lint-ignore no-explicit-any
export async function secureUserForPurchase(supabase: any, user: any, nowMs = Date.now()): Promise<PurchaseAccessAction> {
  if (isMailboxProven(user)) return "proven";
  const created = new Date(user?.created_at ?? 0).getTime();
  if (Number.isFinite(created) && nowMs - created <= FRESH_SIGNUP_MS) return "fresh";
  try {
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password: randomPassword() });
    if (error) throw error;
    const { error: kickError } = await supabase.rpc("kick_user_sessions", { p_user: user.id });
    if (kickError) throw kickError;
    return "reset";
  } catch (e) {
    console.error("secureUserForPurchase selhalo:", user?.id, e);
    return "reset_failed";
  }
}
