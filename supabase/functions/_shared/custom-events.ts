// _shared/custom-events.ts — vlastní zápasy (tabulka custom_events, migrace 036),
// které odds-api.io nenabízí. Event je uložený ve stejném tvaru jako odds-api,
// kurzy pod bookmakerem "Fundly". ID vždy začíná "fx-", takže se nikdy nepletou
// s číselnými ID z odds-api.
export const CUSTOM_BOOKMAKER = "Fundly";

export function isCustomEventId(id: unknown): boolean {
  return String(id ?? "").startsWith("fx-");
}

// deno-lint-ignore no-explicit-any
export async function loadCustomEvents(ids: string[]): Promise<Map<string, any>> {
  // deno-lint-ignore no-explicit-any
  const out = new Map<string, any>();
  const wanted = [...new Set(ids.filter(isCustomEventId))];
  if (!wanted.length) return out;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return out;
  const list = wanted.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
  const res = await fetch(`${url}/rest/v1/custom_events?select=id,event&id=in.(${encodeURIComponent(list)})`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`custom_events HTTP ${res.status}`);
  for (const row of await res.json()) out.set(String(row.id), { ...row.event, id: row.id });
  return out;
}

type Period = { home: number; away: number } | null;

// Výsledek vlastního zápasu ve stejném tvaru, jaký vrací fetchEvent/fetchEventResult
// v settle-tickets a settle-verify (found/status/ft/p1).
export async function customEventResult(id: string): Promise<{ found: true; status: string; ft: Period; p1: Period } | { found: false }> {
  try {
    const ev = (await loadCustomEvents([id])).get(id);
    if (!ev) return { found: false };
    const periods = ev.scores && ev.scores.periods;
    const ft = (periods && periods.ft) || ev.scores || null;
    const p1 = periods && periods.p1;
    const hasFt = ft && typeof ft.home === "number" && typeof ft.away === "number";
    const hasP1 = p1 && typeof p1.home === "number" && typeof p1.away === "number";
    return {
      found: true,
      status: String(ev.status ?? ""),
      ft: hasFt ? { home: ft.home, away: ft.away } : null,
      p1: hasP1 ? { home: p1.home, away: p1.away } : null,
    };
  } catch {
    return { found: false };
  }
}
