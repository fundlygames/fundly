// _shared/ticket-admission.ts — serverová kontrola NOVÉHO tiketu při prvním doručení
// (sync-tickets). Klient je nedůvěryhodný: dřív server uložil cokoli, co klient poslal
// (stávku, kurzy, čas zápasu), a hráč tak mohl sázet na už skončený zápas se starými
// kurzy ("courtsiding", terms §6.1), překročit max. stávku nebo rozsah kurzů.
//
// Neprošlý tiket se NEzahodí, ale stornuje (status push = vrácený vklad + void_reason),
// takže poctivý hráč o peníze nepřijde. Čisté funkce bez Deno API — dají se testovat
// i v prohlížeči. Při výpadku odds-api kontrola "propustí" (fail-open), aby výpadek
// zdroje kurzů neblokoval hráče.

export const ODDS_MIN = 1.0;
export const ODDS_MAX = 8.0;

// tolerance vůči aktuálním kurzům odds-api (nárok hráče = jeho kurz je VYŠŠÍ než trh)
export const LIVE_ODDS_TOLERANCE = { mult: 1.08, add: 0.02 };
export const PREMATCH_ODDS_TOLERANCE = { mult: 1.4, add: 0.1 }; // jen proti vymyšleným kurzům

export interface DraftSelection {
  eventId: string | null;
  marketName: string | null;
  field: string | null;
  hdp: number | null;
  startTime: string | null;
  oddValue: number | null;
  pickLabel: string | null;
}

export interface AdmissionAccount {
  capital: number | string | null;
  phase: number | string | null;
}

// --- pravidla balíčku (zrcadlí js/packages.js packageMeta + js/portfolio.js consistencyLimit)
export function maxStakeFor(cap: number): number {
  return Math.round(cap * 0.015);
}
export function consistencyLimitFor(cap: number, phase: number): number {
  if (phase >= 3) return cap * 0.05 * 0.4; // funded: payoutBufferPct 5 % × 0.4
  return cap * (phase === 1 ? 0.10 : 0.05) * 0.4;
}

export const VOID = {
  stake: "The entry was above the maximum entry size for your package.",
  oddsRange: "One of the odds was outside the allowed range (1.00–8.00).",
  profitLimit: "A single ticket can't account for more than 40 % of the phase profit target.",
  duplicateEvent: "You already had a pending bet on one of these matches.",
  finished: "The match had already finished when the ticket was received.",
  unavailable: "The match was no longer available for betting.",
  noMarket: "That market was no longer available when the ticket was received.",
  oddsChanged: "The odds had changed by the time the ticket was received.",
  notLive: "The match had already started and could not be confirmed as live.",
} as const;

// ---------- statické kontroly (bez odds-api) ----------
export function staticAdmission(
  d: { stake: number | null; selections: DraftSelection[] },
  acc: AdmissionAccount,
  pendingEventIds: Set<string>,
): { reason: string | null; combinedOdds: number } {
  const cap = Number(acc.capital);
  const phase = Number(acc.phase) || 1;
  const stake = Number(d.stake);
  const odds = d.selections.map((s) => Number(s.oddValue));
  const combinedOdds = odds.reduce((a, o) => a * (Number.isFinite(o) ? o : 1), 1);

  if (!Number.isFinite(stake) || stake <= 0) return { reason: VOID.stake, combinedOdds };
  if (Number.isFinite(cap) && cap > 0 && stake > maxStakeFor(cap) + 0.5) return { reason: VOID.stake, combinedOdds };
  if (odds.some((o) => !Number.isFinite(o) || o < ODDS_MIN || o > ODDS_MAX)) return { reason: VOID.oddsRange, combinedOdds };
  if (Number.isFinite(cap) && cap > 0) {
    const potentialProfit = stake * (combinedOdds - 1);
    if (potentialProfit > consistencyLimitFor(cap, phase) + 1) return { reason: VOID.profitLimit, combinedOdds };
  }
  const seen = new Set<string>();
  for (const s of d.selections) {
    const id = String(s.eventId);
    if (seen.has(id) || pendingEventIds.has(id)) return { reason: VOID.duplicateEvent, combinedOdds };
    seen.add(id);
  }
  return { reason: null, combinedOdds };
}

// ---------- kontrola proti živým datům odds-api ----------
export interface EventInfo {
  status: string;            // pending | live | settled | ...
  date: string | null;       // skutečný plánovaný začátek podle odds-api
  // bookmaker -> trhy ({ name, odds: [{ home, away, hdp, over, ... }], updatedAt })
  // deno-lint-ignore no-explicit-any
  bookmakers: Record<string, any[]> | null;
  hasOdds: boolean;          // vrátil se z /odds/multi (tj. aspoň jeden povolený bookmaker kurzy nabízí)
}

const FINISHED = new Set(["settled", "finished", "ended", "completed"]);
const UNAVAILABLE = new Set(["cancelled", "canceled", "postponed", "suspended", "abandoned", "walkover"]);

export async function fetchEventInfo(
  eventIds: string[],
  apiKey: string,
  bookmakers: string[],
  fetchFn: typeof fetch = fetch,
): Promise<Map<string, EventInfo | null>> {
  const base = "https://api.odds-api.io/v3";
  const out = new Map<string, EventInfo | null>();
  const ids = [...new Set(eventIds.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

  await Promise.all(chunks.map(async (chunk) => {
    try {
      const q = new URLSearchParams({ eventIds: chunk.join(","), bookmakers: bookmakers.join(","), apiKey });
      const res = await fetchFn(`${base}/odds/multi?${q}`);
      if (!res.ok) { chunk.forEach((id) => out.set(id, null)); return; }
      const list = await res.json();
      for (const ev of Array.isArray(list) ? list : []) {
        out.set(String(ev.id), { status: String(ev.status ?? ""), date: ev.date ?? null, bookmakers: ev.bookmakers ?? null, hasOdds: true });
      }
    } catch (_) {
      chunk.forEach((id) => out.set(id, null)); // neznámé → fail-open
    }
  }));

  // co /odds/multi nevrátilo: skončený / zrušený zápas, nebo zápas bez kurzů povolených bookmakerů
  const missing = ids.filter((id) => !out.has(id)).slice(0, 25);
  await Promise.all(missing.map(async (id) => {
    try {
      const res = await fetchFn(`${base}/events/${encodeURIComponent(id)}?apiKey=${apiKey}`);
      if (res.status === 404) { out.set(id, null); return; } // už smazaný (starší než ~48 h) → neověřitelné
      if (!res.ok) { out.set(id, null); return; }
      const ev = await res.json();
      out.set(id, { status: String(ev.status ?? ""), date: ev.date ?? null, bookmakers: null, hasOdds: false });
    } catch (_) {
      out.set(id, null);
    }
  }));
  return out;
}

// aktuální kurzy pro výběr napříč povolenými bookmakery (nejvyšší = nejpříznivější pro hráče)
export function currentOdds(sel: DraftSelection, info: EventInfo, bookmakers: string[]): { marketFound: boolean; rowFound: boolean; best: number | null } {
  let marketFound = false, rowFound = false, best: number | null = null;
  for (const bm of bookmakers) {
    const markets = (info.bookmakers && info.bookmakers[bm]) || [];
    const market = markets.find((m: { name: string }) => m.name === sel.marketName);
    if (!market || !Array.isArray(market.odds)) continue;
    marketFound = true;
    // deno-lint-ignore no-explicit-any
    const rows: any[] = market.odds;
    // deno-lint-ignore no-explicit-any
    let row: any = null;
    if (sel.hdp != null) row = rows.find((r) => Number(r.hdp) === Number(sel.hdp)) ?? null;
    else if (rows.length === 1) row = rows[0];
    else row = rows.find((r) => r.label && sel.pickLabel && String(sel.pickLabel).includes(String(r.label))) ?? null;
    if (!row || !sel.field) continue;
    rowFound = true;
    const v = parseFloat(row[sel.field]);
    if (Number.isFinite(v) && (best === null || v > best)) best = v;
  }
  return { marketFound, rowFound, best };
}

export function evaluateSelection(
  sel: DraftSelection,
  info: EventInfo | null | undefined,
  bookmakers: string[],
  nowMs: number,
): string | null {
  if (!info) return null; // neznámé (výpadek API / smazaný zápas) → fail-open
  const status = info.status.toLowerCase();
  if (FINISHED.has(status)) return VOID.finished;
  if (UNAVAILABLE.has(status)) return VOID.unavailable;

  const dateMs = info.date ? new Date(info.date).getTime() : NaN;
  if (!info.hasOdds) {
    // zápas existuje, ale povolení bookmakeři k němu kurzy už nenabízejí (typicky trh stažený po rozhodnutí)
    return (status === "live" || (Number.isFinite(dateMs) && dateMs <= nowMs)) ? VOID.noMarket : null;
  }
  const isLive = status === "live";
  if (!isLive && Number.isFinite(dateMs) && dateMs <= nowMs) return VOID.notLive; // "pending", ale začátek už byl

  const cur = currentOdds(sel, info, bookmakers);
  if (!cur.marketFound) return isLive ? VOID.noMarket : null;
  // linka (hdp), kterou hráč vsadil, už se nenabízí; bez hdp řádek spolehlivě nespárujeme → nezamítat
  if (!cur.rowFound) return (isLive && sel.hdp != null) ? VOID.noMarket : null;
  const claimed = Number(sel.oddValue);
  if (cur.best !== null && Number.isFinite(claimed)) {
    const tol = isLive ? LIVE_ODDS_TOLERANCE : PREMATCH_ODDS_TOLERANCE;
    if (claimed > cur.best * tol.mult + tol.add) return VOID.oddsChanged;
  }
  return null;
}
