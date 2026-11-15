// _shared/weekly-report-stats.ts — metriky týdenního reportu z řádků tabulky `tickets`.
// Čistá logika bez závislostí (jde otestovat v node --experimental-strip-types).
// Klientská obdoba (dashboard → Výkon → Analýza) je js/analytics.js — výpočty držet v souladu:
//   vyhodnocený tip = won | lost | push | cashedout, bez storna (admission_note "voided: …")
//   úspěšnost = won / (won + lost), ROI = (payout − vklad) / vklad
//   pásma kurzu 1.00–1.50 / 1.50–2.00 / 2.00–3.00 / 3.00–5.00 / 5.00–8.00 / 8.00+ (jen kombinace)
//   den v týdnu tady v UTC (klient v místním čase).

export interface ReportTicket {
  stake: number | string | null;
  payout: number | string | null;
  status: string;
  placed_at: string;
  settled_at: string | null;
  combined_odds?: number | string | null;
  selections?: { sport?: string; league?: string; marketName?: string; oddValue?: number }[] | null;
  admission_note?: string | null;
}

export type Dim = "band" | "sport" | "league" | "market" | "type" | "weekday";

export interface Segment {
  dim: Dim;
  key: string;
  n: number;
  won: number;
  lost: number;
  staked: number;
  net: number;
  winRate: number | null;
  roi: number;
}

export interface Discipline {
  count: number;
  avgPct: number | null;
  cv: number | null;
  above1Share: number | null;
  maxStake: number;
  chaseRatio: number | null;
  /** jedna poznámka do e-mailu (klíč šablony + hodnota) */
  note: { kind: "chasing" | "above1" | "uneven" | "steady" | "few"; value?: number };
}

export interface WeeklyStats {
  tips: number;
  pending: number;
  winRate: number | null;
  roi: number;
  net: number;
  staked: number;
  profitPctOfCap: number | null;
  best: Segment | null;
  worst: Segment | null;
  discipline: Discipline;
}

export const BAND_LABELS: Record<string, string> = {
  b1: "1.00–1.50", b2: "1.50–2.00", b3: "2.00–3.00", b4: "3.00–5.00", b5: "5.00–8.00", b6: "8.00+",
};
/** v týdnu je tipů méně než za celou dobu → segment už od 3 tipů (dashboard: 5) */
export const WEEKLY_MIN_SEGMENT = 3;
const DIMS: Dim[] = ["band", "sport", "league", "market", "type", "weekday"];
const SETTLED = new Set(["won", "lost", "push", "cashedout"]);

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const isVoided = (t: ReportTicket) => typeof t.admission_note === "string" && t.admission_note.startsWith("voided:");
export const isSettledTip = (t: ReportTicket) => SETTLED.has(t.status) && !isVoided(t);
const sels = (t: ReportTicket) => (Array.isArray(t.selections) ? t.selections : []);

export function bandKey(odds: number): string {
  if (odds >= 8 + 1e-9) return "b6";
  if (odds < 1.5 - 1e-9) return "b1";
  if (odds < 2 - 1e-9) return "b2";
  if (odds < 3 - 1e-9) return "b3";
  if (odds < 5 - 1e-9) return "b4";
  return "b5";
}

function oddsOf(t: ReportTicket): number {
  const c = num(t.combined_odds);
  if (c > 0) return c;
  return sels(t).reduce((a, s) => a * (num(s?.oddValue) || 1), 1);
}

function common(t: ReportTicket, field: "sport" | "league" | "marketName"): string {
  const vals = sels(t).map((s) => s?.[field]).filter((v) => v !== undefined && v !== null && v !== "");
  if (!vals.length) return "__unknown";
  return vals.every((v) => v === vals[0]) ? String(vals[0]) : "__mixed";
}

function keyOf(dim: Dim, t: ReportTicket): string {
  switch (dim) {
    case "band": return bandKey(oddsOf(t));
    case "sport": return common(t, "sport");
    case "league": return common(t, "league");
    case "market": return common(t, "marketName");
    case "type": return sels(t).length > 1 ? "combo" : "single";
    case "weekday": {
      const d = new Date(t.placed_at);
      return Number.isFinite(d.getTime()) ? String((d.getUTCDay() + 6) % 7) : "__unknown";
    }
  }
}

function seg(dim: Dim, key: string): Segment {
  return { dim, key, n: 0, won: 0, lost: 0, staked: 0, net: 0, winRate: null, roi: 0 };
}
function add(s: Segment, t: ReportTicket) {
  s.n++;
  if (t.status === "won") s.won++;
  else if (t.status === "lost") s.lost++;
  s.staked += num(t.stake);
  s.net += num(t.payout) - num(t.stake);
}
function done(s: Segment): Segment {
  s.winRate = s.won + s.lost ? s.won / (s.won + s.lost) : null;
  s.roi = s.staked > 0 ? s.net / s.staked : 0;
  return s;
}

export function segments(dim: Dim, settled: ReportTicket[]): Segment[] {
  const map = new Map<string, Segment>();
  for (const t of settled) {
    const k = keyOf(dim, t);
    if (k === "__unknown") continue;
    if (!map.has(k)) map.set(k, seg(dim, k));
    add(map.get(k)!, t);
  }
  return [...map.values()].map(done);
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/**
 * Disciplína vkladů. `placed` = tipy podané v období (vč. čekajících), `history` = všechny
 * známé tipy (kvůli tomu, jak dopadl tip před prvním tipem týdne).
 */
export function discipline(placed: ReportTicket[], history: ReportTicket[], cap: number): Discipline {
  const list = placed.filter((t) => !isVoided(t) && num(t.stake) > 0);
  const stakes = list.map((t) => num(t.stake));
  const m = mean(stakes);
  const sd = stakes.length >= 2 ? Math.sqrt(mean(stakes.map((s) => (s - m) * (s - m)))) : 0;
  const cv = m > 0 && stakes.length >= 2 ? sd / m : null;
  const above1Share = stakes.length && cap > 0 ? stakes.filter((s) => s > cap * 0.01 + 1e-9).length / stakes.length : null;

  const decided = history.filter((t) => isSettledTip(t) && t.settled_at && (t.status === "won" || t.status === "lost"))
    .sort((a, b) => Date.parse(a.settled_at!) - Date.parse(b.settled_at!));
  const ordered = list.slice().sort((a, b) => Date.parse(a.placed_at) - Date.parse(b.placed_at));
  const afterLoss: number[] = [], afterWin: number[] = [];
  let i = 0;
  let last: ReportTicket | null = null;
  for (const t of ordered) {
    const at = Date.parse(t.placed_at);
    while (i < decided.length && Date.parse(decided[i].settled_at!) <= at) { last = decided[i]; i++; }
    if (!last || last === t) continue;
    (last.status === "lost" ? afterLoss : afterWin).push(num(t.stake));
  }
  const chaseRatio = afterLoss.length >= 2 && afterWin.length >= 2 && mean(afterWin) > 0 ? mean(afterLoss) / mean(afterWin) : null;

  let note: Discipline["note"];
  if (stakes.length < 3) note = { kind: "few" };
  else if (chaseRatio !== null && chaseRatio >= 1.25) note = { kind: "chasing", value: chaseRatio - 1 };
  else if (above1Share !== null && above1Share >= 0.25) note = { kind: "above1", value: above1Share };
  else if (cv !== null && cv >= 0.7) note = { kind: "uneven", value: cv };
  else note = { kind: "steady" };

  return {
    count: stakes.length,
    avgPct: cap > 0 && stakes.length ? (m / cap) * 100 : null,
    cv,
    above1Share,
    maxStake: stakes.length ? Math.max(...stakes) : 0,
    chaseRatio,
    note,
  };
}

/**
 * Metriky za období [fromMs, toMs). `tickets` = tipy účtu (stačí ty podané/vyhodnocené
 * v okolí období; starší pomůžou jen u "vklad po prohraném tipu").
 */
export function weeklyStats(tickets: ReportTicket[], cap: number, fromMs: number, toMs: number): WeeklyStats {
  const inRange = (iso: string | null) => {
    const ms = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(ms) && ms >= fromMs && ms < toMs;
  };
  const settled = tickets.filter((t) => isSettledTip(t) && inRange(t.settled_at));
  const placed = tickets.filter((t) => inRange(t.placed_at));
  const total = done(settled.reduce((s, t) => { add(s, t); return s; }, seg("type", "all")));

  const cands: Segment[] = [];
  for (const d of DIMS) {
    for (const s of segments(d, settled)) {
      if (s.n >= WEEKLY_MIN_SEGMENT && s.n < settled.length && s.key !== "__mixed" && s.staked > 0) cands.push(s);
    }
  }
  const best = cands.filter((s) => s.roi > 0.005).sort((a, b) => b.roi - a.roi || b.n - a.n)[0] ?? null;
  const worst = cands.filter((s) => s.roi < -0.005).sort((a, b) => a.roi - b.roi || b.n - a.n)[0] ?? null;

  return {
    tips: settled.length,
    pending: tickets.filter((t) => t.status === "pending").length,
    winRate: total.winRate,
    roi: total.roi,
    net: total.net,
    staked: total.staked,
    profitPctOfCap: cap > 0 ? (total.net / cap) * 100 : null,
    best,
    worst,
    discipline: discipline(placed, tickets, cap),
  };
}

/** Pondělí (UTC, "YYYY-MM-DD") týdne, do kterého spadá daný okamžik. */
export function mondayUtc(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return m.toISOString().slice(0, 10);
}
