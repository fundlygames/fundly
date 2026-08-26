// _shared/capacity.ts — limit "jen prvních N kupujících", pak waitlist.
// Nastavení: supabase secrets set LAUNCH_CAPACITY=20 (bez proměnné žádný limit neplatí).
// Aktivační poplatek (funded účet) se do limitu nepočítá — to není nový "kupující",
// jen doplatek existujícího zákazníka, který si Challenge už koupil dřív.

export function launchCapacity(): number | null {
  const raw = Deno.env.get("LAUNCH_CAPACITY");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// deno-lint-ignore no-explicit-any
export async function soldCount(supabase: any): Promise<number> {
  const { count, error } = await supabase
    .from("challenge_accounts")
    .select("id", { count: "exact", head: true })
    .neq("package_key", "activation");
  if (error) throw error;
  return count ?? 0;
}

// Má tenhle e-mail platnou pozvánku z waitlistu (pozvaný, ještě nevyužitý)?
// deno-lint-ignore no-explicit-any
export async function isInvited(supabase: any, email: string): Promise<boolean> {
  const { data } = await supabase
    .from("waitlist")
    .select("id")
    .ilike("email", email.trim())
    .not("invited_at", "is", null)
    .is("redeemed_at", null)
    .maybeSingle();
  return !!data;
}

// deno-lint-ignore no-explicit-any
export async function markRedeemed(supabase: any, email: string): Promise<void> {
  await supabase
    .from("waitlist")
    .update({ redeemed_at: new Date().toISOString() })
    .ilike("email", email.trim())
    .not("invited_at", "is", null)
    .is("redeemed_at", null);
}
