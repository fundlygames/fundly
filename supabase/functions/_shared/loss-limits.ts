// _shared/loss-limits.ts — serverové vynucení limitů ztráty (terms §5): max. celková ztráta
// −10 % kapitálu (statická, fáze 1–2) a max. denní ztráta −4 % kapitálu (UTC den).
//
// Dřív tyhle limity hlídal jen klient (js/portfolio.js breachInfo) a server věřil jeho
// hlášení "breached" — upravený prohlížeč mohl prostě nikdy nehlásit překročení limitu.
// Tady se obojí počítá z tabulky tickets, stejně jako klientské Portfolio, ale konzervativně:
// otevřené (nevyřízené) vklady se NEpočítají jako ztráta (jsou přičtené zpět), takže server
// zavře účet jen při skutečně prohraných/vyřízených tiketech.
//
// Čistá logika bez závislostí (testovatelná mimo Deno). Funded účty se tu nehlídají —
// mají výběry, které se v tiketech neprojeví, a trailing limit závisí na hwm.

export const MAX_LOSS_PCT = 0.10;
export const DAILY_LOSS_PCT = 0.04;
const TOLERANCE = 0.5; // zaokrouhlovací rezerva v $

export interface LossAccount {
  capital: number | string | null;
  phase: number;
  state: string;
  phase_started_at: string | null;
  phase_baseline: number | string | null;
}

export interface LossTicket {
  stake: number | string | null;
  payout: number | string | null;
  status: string;
  placed_at: string;
  settled_at?: string | null;
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const pays = (t: LossTicket) => t.status === "won" || t.status === "cashedout" || t.status === "push";

// Zůstatek fáze z tiketů zadaných od začátku fáze; otevřené vklady se přičtou zpět.
export function settledPhaseBalance(acc: LossAccount, tickets: LossTicket[]): number {
  const cap = Number(acc.capital);
  const baselineRaw = Number(acc.phase_baseline);
  let bal = acc.phase_baseline != null && Number.isFinite(baselineRaw) && baselineRaw > 0 ? baselineRaw : cap;
  const start = acc.phase_started_at ? new Date(acc.phase_started_at).getTime() : 0;
  for (const t of tickets) {
    if (new Date(t.placed_at).getTime() < start) continue;
    if (t.status === "pending") continue; // nevyřízený vklad není ztráta
    bal -= Number(t.stake) || 0;
    if (pays(t)) bal += Number(t.payout) || 0;
  }
  return bal;
}

// Denní změna zůstatku (UTC den nowMs), stejně jako klient: vklad se odečte v den zadání,
// výplata se připíše v den vyřízení; nevyřízené vklady se nepočítají.
export function dailyNet(tickets: LossTicket[], nowMs: number): number {
  const today = dayOf(nowMs);
  let net = 0;
  for (const t of tickets) {
    if (t.status === "pending") continue;
    const placedMs = new Date(t.placed_at).getTime();
    if (dayOf(placedMs) === today) net -= Number(t.stake) || 0;
    if (pays(t)) {
      // vyřízení nikdy dřív než zadání (klientem dodané settled_at nesmí posunout výplatu do minulosti)
      const settledMs = t.settled_at ? new Date(t.settled_at).getTime() : NaN;
      const effective = Number.isFinite(settledMs) && settledMs > placedMs ? settledMs : placedMs;
      if (dayOf(effective) === today) net += Number(t.payout) || 0;
    }
  }
  return net;
}

// Důvod porušení limitu (stejné texty jako klient), nebo null.
export function lossLimitBreach(acc: LossAccount, tickets: LossTicket[], nowMs: number): string | null {
  if (acc.state !== "active" && acc.state !== "pending_approval") return null;
  if (acc.phase !== 1 && acc.phase !== 2) return null;
  const cap = Number(acc.capital);
  if (!Number.isFinite(cap) || cap <= 0) return null;

  const floor = cap * (1 - MAX_LOSS_PCT);
  if (settledPhaseBalance(acc, tickets) <= floor) {
    return "Max. loss exceeded (static -10 %)";
  }
  const loss = -dailyNet(tickets, nowMs);
  if (loss > cap * DAILY_LOSS_PCT + TOLERANCE) {
    return "Max. daily loss exceeded (-4 %)";
  }
  return null;
}
