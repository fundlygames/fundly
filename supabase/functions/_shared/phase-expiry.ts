// _shared/phase-expiry.ts — pravidlo "30 kalendářních dní na fázi" (terms §4.1/4.2).
// Čistá logika bez závislostí, ať jde otestovat mimo Deno. Používá account-maintenance.
//
// Lhůta fáze 1/2 = 30 dní od phase_started_at + phase_bonus_days (kompenzace
// výpadků, viz migrace 027). Fáze 3 (funded) lhůtu nemá — tam platí jen pravidlo
// neaktivity (14 dní bez tiketu) v account-maintenance.

export const PHASE_DAYS = 30;
const DAY_MS = 86400000;

export interface PhaseAccount {
  id: string;
  email: string | null;
  package_key: string | null;
  capital: number | string | null;
  phase: number;
  state: string;
  phase_started_at: string | null;
  phase_bonus_days: number | null;
  phase_balance: number | string | null;
  phase_baseline: number | string | null;
}

export function phaseLengthDays(acc: Pick<PhaseAccount, "phase_bonus_days">): number {
  return PHASE_DAYS + (Number(acc.phase_bonus_days) || 0);
}

// ms timestamp konce lhůty, nebo null když účet žádnou lhůtu nemá / neznáme začátek fáze
export function phaseDeadlineMs(acc: PhaseAccount): number | null {
  if (acc.phase !== 1 && acc.phase !== 2) return null;
  if (!acc.phase_started_at) return null;
  const start = new Date(acc.phase_started_at).getTime();
  if (!Number.isFinite(start)) return null;
  return start + phaseLengthDays(acc) * DAY_MS;
}

export function isPhaseExpired(acc: PhaseAccount, nowMs: number): boolean {
  const deadline = phaseDeadlineMs(acc);
  return deadline !== null && nowMs >= deadline;
}

export interface PhaseTicket {
  stake: number | string | null;
  payout: number | string | null;
  status: string;
  placed_at: string;
}

// Zisk fáze DOKÁZANÝ tikety (vklady − výplaty vyřízených tiketů zadaných od začátku
// fáze). Uložený phase_balance se tu schválně NEpoužívá: u starých účtů (před
// serverovou kontrolou zůstatku, 22. 9.) může být nesmyslně nafouklý — reálně nalezeno
// u Starter účtu za $2 000 s uloženým zůstatkem $24 525 a dvěma tikety.
export function provenPhaseProfit(acc: PhaseAccount, tickets: PhaseTicket[]): number {
  const start = acc.phase_started_at ? new Date(acc.phase_started_at).getTime() : 0;
  let profit = 0;
  for (const t of tickets) {
    if (new Date(t.placed_at).getTime() < start) continue;
    profit -= Number(t.stake) || 0;
    if (t.status === "won" || t.status === "cashedout" || t.status === "push") profit += Number(t.payout) || 0;
  }
  return profit;
}

// Hráč, který cíl fáze už splnil, ale klient ještě nestihl poslat přechod do
// pending_approval (zavřená karta těsně po splnění), nesmí být zavřen pro čas —
// do lhůty cíl splnil, zbytek je na našem schvalování.
export function reachedPhaseTarget(acc: PhaseAccount, tickets: PhaseTicket[]): boolean {
  const cap = Number(acc.capital);
  if (!Number.isFinite(cap) || cap <= 0) return false;
  const target = cap * (acc.phase === 1 ? 0.10 : 0.05);
  return provenPhaseProfit(acc, tickets) >= target - 0.5;
}

// interní / testovací účty se nikdy automaticky nezavírají
export function isExcludedFromExpiry(acc: Pick<PhaseAccount, "email" | "package_key">, extraExcluded: string[] = []): boolean {
  const email = String(acc.email ?? "").trim().toLowerCase();
  if (acc.package_key === "test") return true;
  if (email.endsWith("@fundly.games")) return true;
  return extraExcluded.map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email);
}

export function expiryReason(acc: PhaseAccount): string {
  return `Phase ${acc.phase} time limit exceeded (${phaseLengthDays(acc)} days)`;
}
