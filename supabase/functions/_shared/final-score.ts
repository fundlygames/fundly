// _shared/final-score.ts — z jakého skóre se vyhodnocuje tiket.
// odds-api (od 12. 11. 2026): periods.ft = jen ŘÁDNÁ hrací doba, periods.ot = průběžný
// součet PO prodloužení, periods.ap = po nájezdech/penaltách. Hlavní trhy (ML bez remízy,
// Spread, Totals) v basketbalu, americkém fotbalu, baseballu a hokeji ale u Bet365 platí
// VČETNĚ prodloužení (hokej i nájezdů — vítěz nájezdů = +1 gól). Dřív se bralo jen ft,
// takže zápas rozhodnutý v prodloužení skončil jako remíza → push a over/under se počítal
// jen z řádné doby. Fotbal (ML s remízou, 90 min) a ostatní sporty dál podle ft.
type Score = { home: number; away: number };
const num = (s: unknown): s is Score =>
  !!s && typeof (s as Score).home === "number" && typeof (s as Score).away === "number";

const OT_SPORTS = new Set(["basketball", "american-football", "baseball", "ice-hockey"]);

// deno-lint-ignore no-explicit-any
export function finalScore(ev: any): Score | null {
  const periods = (ev && ev.scores && ev.scores.periods) || {};
  const reg = periods.ft || (ev && ev.scores) || null;
  const slug = String((ev && ev.sport && (ev.sport.slug || ev.sport)) || "");
  if (!OT_SPORTS.has(slug)) return num(reg) ? { home: reg.home, away: reg.away } : null;
  const afterOt = num(periods.ot) ? periods.ot : reg;
  if (!num(afterOt)) return null;
  // hokej: rozhodnuto v nájezdech → vítězi nájezdů +1 gól (pravidlo bookmakerů)
  if (slug === "ice-hockey" && num(periods.ap) && afterOt.home === afterOt.away && periods.ap.home !== periods.ap.away) {
    return periods.ap.home > periods.ap.away
      ? { home: afterOt.home + 1, away: afterOt.away }
      : { home: afterOt.home, away: afterOt.away + 1 };
  }
  return { home: afterOt.home, away: afterOt.away };
}

// Skóre po ŘÁDNÉ hrací době (bez prodloužení a nájezdů) — pro trh "3-Way Result"
// (hokej / basketbal / házená 1X2 v základní době: remíza po 60 min = remíza, i když se
// pak hraje prodloužení). odds-api: periods.ft = řádná doba.
// deno-lint-ignore no-explicit-any
export function regulationScore(ev: any): Score | null {
  const periods = (ev && ev.scores && ev.scores.periods) || {};
  const reg = periods.ft || (ev && ev.scores) || null;
  return num(reg) ? { home: reg.home, away: reg.away } : null;
}

// Skóre 1. poločasu pro HT trhy. Basketbal / americký fotbal s ČTVRTINAMI (p1–p4):
// poločas = p1 + p2 (dřív se bralo jen p1 = 1. čtvrtina → HT trhy se vyhodnocovaly špatně).
// Formát s poločasy (NCAA basketbal: jen p1, p2) a ostatní sporty: p1.
const QUARTER_SPORTS = new Set(["basketball", "american-football"]);
// deno-lint-ignore no-explicit-any
export function halfScore(ev: any): Score | null {
  const periods = (ev && ev.scores && ev.scores.periods) || {};
  const slug = String((ev && ev.sport && (ev.sport.slug || ev.sport)) || "");
  if (QUARTER_SPORTS.has(slug) && (num(periods.p3) || num(periods.p4))) {
    return num(periods.p1) && num(periods.p2)
      ? { home: periods.p1.home + periods.p2.home, away: periods.p1.away + periods.p2.away }
      : null;
  }
  return num(periods.p1) ? { home: periods.p1.home, away: periods.p1.away } : null;
}
