// _shared/monthly-recap.ts — měsíční přehled („Tvůj měsíc") do týdenního e-mailu (funkce weekly-report).
// Posílá se v prvním týdenním e-mailu měsíce (pondělí 1.–7. den v UTC) za CELÝ předchozí kalendářní
// měsíc (UTC). Klientská obdoba: js/recap.js (dashboard → Výkon → Měsíc, místní čas prohlížeče).
// Metriky se počítají stejně jako týdenní (weeklyStats nad rozsahem měsíce) + nejlepší sport,
// nejlepší tip a srovnání s měsícem před tím. Čistá logika bez Deno API (test v node --experimental-strip-types).
import { isSettledTip, type ReportTicket, type Segment, segments, weeklyStats, type WeeklyStats } from "./weekly-report-stats.ts";

/** nejlepší sport až od tolika vyhodnocených tipů (stejně jako js/recap.js MIN_SPORT) */
export const MONTHLY_MIN_SPORT = 3;

export interface MonthRange {
  /** "YYYY-MM" předchozího měsíce */
  key: string;
  fromMs: number;
  toMs: number;
  /** začátek měsíce před ním (srovnání) */
  prevFromMs: number;
}

export interface MonthlyRecap {
  key: string;
  cur: WeeklyStats;
  prev: WeeklyStats | null;
  bestSport: Segment | null;
  bestTip: { match: string; pick: string; odds: number; net: number } | null;
}

/** předchozí kalendářní měsíc (UTC) vůči okamžiku `nowMs` */
export function previousMonthRange(nowMs: number): MonthRange {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const fromMs = Date.UTC(y, m - 1, 1);
  const from = new Date(fromMs);
  return {
    key: `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, "0")}`,
    fromMs,
    toMs: Date.UTC(y, m, 1),
    prevFromMs: Date.UTC(y, m - 2, 1),
  };
}

/** první týdenní e-mail měsíce = pondělí 1.–7. dne (UTC) */
export function isMonthlyRun(nowMs: number): boolean {
  return new Date(nowMs).getUTCDate() <= 7;
}

type Sel = { homeTeam?: string; awayTeam?: string; league?: string; marketName?: string; pickLabel?: string };
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function monthlyRecap(tickets: ReportTicket[], cap: number, r: MonthRange): MonthlyRecap | null {
  const cur = weeklyStats(tickets, cap, r.fromMs, r.toMs);
  if (!cur.tips) return null;
  const prevStats = weeklyStats(tickets, cap, r.prevFromMs, r.fromMs);
  const inMonth = (t: ReportTicket) => {
    const ms = t.settled_at ? Date.parse(t.settled_at) : NaN;
    return isSettledTip(t) && Number.isFinite(ms) && ms >= r.fromMs && ms < r.toMs;
  };
  const settled = tickets.filter(inMonth);
  const bestSport = segments("sport", settled)
    .filter((s) => s.n >= MONTHLY_MIN_SPORT && s.key !== "__mixed" && s.staked > 0)
    .sort((a, b) => b.roi - a.roi || b.n - a.n)[0] ?? null;

  let bestTip: MonthlyRecap["bestTip"] = null;
  for (const t of settled) {
    const net = num(t.payout) - num(t.stake);
    if (t.status !== "won" || net <= 0 || (bestTip && net <= bestTip.net)) continue;
    const sels = (Array.isArray(t.selections) ? t.selections : []) as Sel[];
    const s = sels[0] ?? {};
    bestTip = {
      match: sels.length > 1 ? `×${sels.length}` : (s.homeTeam && s.awayTeam ? `${s.homeTeam} – ${s.awayTeam}` : String(s.league ?? "")),
      pick: sels.length > 1 ? "" : String(s.pickLabel ?? ""),
      odds: num(t.combined_odds) || num((s as { oddValue?: number }).oddValue),
      net,
    };
  }
  return { key: r.key, cur, prev: prevStats.tips >= 3 ? prevStats : null, bestSport, bestTip };
}
