// _shared/settle.ts — server-side vyhodnocení výběru tiketu, 1:1 port
// settleSelection() z js/portfolio.js. MUSÍ zůstat identické s klientem,
// jinak by se stejný tiket mohl vyhodnotit jinak podle toho, kdo ho vyřídil
// první (klient při otevřeném dashboardu, nebo tenhle cron).
export type Selection = {
  marketName: string | null;
  field: string | null;
  hdp?: number | null;
};

export type Period = { home: number; away: number } | null | undefined;
export type Scores = { ft: Period; p1: Period };

const HT_MARKETS = new Set([
  "ML HT", "Half Time Result", "Totals HT", "Spread HT", "Odd/Even HT",
  "Double Chance HT", "Alternative 1st Half Goal Line", "Alternative 1st Half Asian Handicap",
]);
const ML_MARKETS = new Set(["ML", "ML HT", "Half Time Result"]);
const TOTALS_MARKETS = new Set([
  "Totals", "Goals Over/Under", "Totals HT",
  "Alternative Goal Line", "Alternative Total Goals", "Alternative 1st Half Goal Line",
]);
const SPREAD_MARKETS = new Set([
  "Spread", "Spread HT", "Alternative Asian Handicap", "Alternative 1st Half Asian Handicap",
]);
const ODD_EVEN_MARKETS = new Set(["Odd/Even", "Odd/Even HT", "Odd/Even 2H"]);
const DOUBLE_CHANCE_MARKETS = new Set(["Double Chance", "Double Chance HT"]);

// Trhy, co tahle funkce umí vyhodnotit — MUSÍ zůstat v souladu s
// GRADEABLE_MARKETS v js/dashboard.js (ten filtruje, na co se vůbec dá
// vsadit, tak aby nikdy nešlo vsadit na trh, který tu skončí jako "default: push").
export function settleSelection(sel: Selection, scores: Scores): "won" | "lost" | "push" {
  const market = sel.marketName ?? "";
  const isHt = HT_MARKETS.has(market);
  const period = isHt ? scores.p1 : scores.ft;
  if (!period || typeof period.home !== "number" || typeof period.away !== "number") return "push";
  const finalHome = period.home, finalAway = period.away;
  const total = finalHome + finalAway;

  if (ML_MARKETS.has(market)) {
    if (finalHome === finalAway) return sel.field === "draw" ? "won" : "lost";
    const winner = finalHome > finalAway ? "home" : "away";
    return sel.field === winner ? "won" : "lost";
  }

  if (TOTALS_MARKETS.has(market)) {
    if (sel.hdp == null) return "push";
    if (total === sel.hdp) return "push";
    const over = total > sel.hdp;
    if (sel.field === "over") return over ? "won" : "lost";
    if (sel.field === "under") return !over ? "won" : "lost";
    return "push";
  }

  if (market === "Both Teams To Score") {
    const btts = finalHome > 0 && finalAway > 0;
    if (sel.field === "yes") return btts ? "won" : "lost";
    if (sel.field === "no") return !btts ? "won" : "lost";
    return "push";
  }

  if (SPREAD_MARKETS.has(market)) {
    if (sel.hdp == null) return "push";
    const adjHome = finalHome + sel.hdp;
    if (adjHome === finalAway) return "push";
    const winner = adjHome > finalAway ? "home" : "away";
    return sel.field === winner ? "won" : "lost";
  }

  if (market === "European Handicap") {
    if (sel.hdp == null) return "push";
    const adjHome = finalHome + sel.hdp;
    const winner = adjHome === finalAway ? "draw" : adjHome > finalAway ? "home" : "away";
    return sel.field === winner ? "won" : "lost";
  }

  if (market === "Draw No Bet") {
    if (finalHome === finalAway) return "push";
    const winner = finalHome > finalAway ? "home" : "away";
    return sel.field === winner ? "won" : "lost";
  }

  if (DOUBLE_CHANCE_MARKETS.has(market)) {
    const winner = finalHome === finalAway ? "draw" : finalHome > finalAway ? "home" : "away";
    const covers: Record<string, string[]> = { "1X": ["home", "draw"], "12": ["home", "away"], "X2": ["draw", "away"] };
    const set = covers[sel.field ?? ""];
    if (!set) return "push";
    return set.includes(winner) ? "won" : "lost";
  }

  if (ODD_EVEN_MARKETS.has(market)) {
    let sum: number;
    if (market === "Odd/Even 2H") {
      if (!scores.p1 || typeof scores.p1.home !== "number" || !scores.ft) return "push";
      sum = (scores.ft.home - scores.p1.home) + (scores.ft.away - scores.p1.away);
    } else {
      sum = total;
    }
    const isOdd = Math.abs(sum) % 2 === 1;
    if (sel.field === "odd") return isOdd ? "won" : "lost";
    if (sel.field === "even") return !isOdd ? "won" : "lost";
    return "push";
  }

  return "push";
}
