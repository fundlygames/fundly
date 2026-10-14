// _shared/throttle.ts — jednoduché omezení frekvence podle klíče (tabulka email_throttle).
// allow() vrátí true a zapíše čas, nebo false, když poslední povolení bylo před méně než
// minIntervalMs. Při chybě DB propustí (omezení nesmí zablokovat legitimní e-mail).
// deno-lint-ignore no-explicit-any
export async function allow(supabase: any, key: string, minIntervalMs: number): Promise<boolean> {
  try {
    const { data } = await supabase.from("email_throttle").select("last_at").eq("key", key).maybeSingle();
    const now = Date.now();
    if (data && now - new Date(data.last_at).getTime() < minIntervalMs) return false;
    await supabase.from("email_throttle").upsert({ key, last_at: new Date(now).toISOString() });
    return true;
  } catch (_) {
    return true;
  }
}
