// _shared/settle-verify.ts — nezávislé server-side ověření výsledku tiketu
// proti skutečným datům z odds-api, sdílené mezi settle-tickets (cron) a
// sync-tickets (real-time obrana proti klientovi, co nahlásí výsledek
// tiketu, který server ještě jako vyřízený nezná — viz sync-tickets pro
// kontext). BEZ tohohle sync-tickets ukládal status/payout přímo od
// klienta bez jakéhokoli ověření, což šlo zneužít (reálně nalezeno 22.9. —
// účet měl v tabulce tickets podklad jen pro $24,608, ale server měl
// uložený zůstatek $27,665, bez jakéhokoli tiketu, co by ten rozdíl vysvětlil).
import { settleSelection, type Selection } from "./settle.ts";

const API_BASE = "https://api.odds-api.io/v3";
// stejná bezpečná rezerva jako settle-tickets/index.ts a js/portfolio.js —
// odds-api drží historii zápasu jen ~24-48h.
const STALE_AFTER_MS = 30 * 3600 * 1000;

export type VerifySelection = Selection & {
  eventId: string | null;
  oddValue: number | null;
  startTime: string | null;
};

type Period = { home: number; away: number } | null;
type EventResult = { found: true; status: string; ft: Period; p1: Period } | { found: false };

async function fetchEventResult(id: string, apiKey: string): Promise<EventResult> {
  try {
    const res = await fetch(`${API_BASE}/events/${id}?apiKey=${apiKey}`);
    if (res.status === 404) return { found: false };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // deno-lint-ignore no-explicit-any
    const ev: any = await res.json();
    const periods = ev.scores && ev.scores.periods;
    const ft = (periods && periods.ft) || ev.scores || null;
    const p1 = periods && periods.p1;
    const hasFt = ft && typeof ft.home === "number" && typeof ft.away === "number";
    const hasP1 = p1 && typeof p1.home === "number" && typeof p1.away === "number";
    return {
      found: true,
      status: ev.status,
      ft: hasFt ? { home: ft.home, away: ft.away } : null,
      p1: hasP1 ? { home: p1.home, away: p1.away } : null,
    };
  } catch {
    return { found: false };
  }
}

// Vrátí skutečný výsledek tiketu podle reálných dat, nebo null, když se to
// ještě nedá rozhodnout (zápas neskončil / odds-api ho ještě neoznačilo
// "settled" / data zmizela a tiket ještě není dost starý na stale-fallback).
// payoutFactor se násobí se stake na serveru volajícím kódu (sync-tickets),
// stejně jako settle-tickets/index.ts to dělá u payout = Math.round(stake * factor).
export async function verifyTicketOutcome(
  selections: VerifySelection[],
  placedAt: string,
  apiKey: string,
): Promise<{ status: "won" | "lost" | "push"; payoutFactor: number } | null> {
  if (!selections.length) return null;
  const now = Date.now();
  const ticketStale = now - new Date(placedAt).getTime() > STALE_AFTER_MS;

  const eventIds = [...new Set(selections.filter((s) => s.eventId).map((s) => s.eventId as string))];
  const statusMap = new Map<string, EventResult>();
  for (const id of eventIds) statusMap.set(id, await fetchEventResult(id, apiKey));

  const results: ("won" | "lost" | "push" | null)[] = selections.map((s) => {
    if (!s.eventId || !s.startTime) return ticketStale ? "push" : null;
    const startedAgo = now - new Date(s.startTime).getTime();
    if (startedAgo < 0) return null; // zápas ještě nezačal — určitě není rozhodnuto
    const ev = statusMap.get(s.eventId);
    const stale = startedAgo > STALE_AFTER_MS;
    if (!ev || !ev.found) return stale ? "push" : null;
    if (ev.status !== "settled") return stale ? "push" : null;
    if (!ev.ft) return "push";
    return settleSelection(s, { ft: ev.ft, p1: ev.p1 });
  });
  if (results.some((r) => r === null)) return null; // ještě nerozhodnuto

  if (results.includes("lost")) return { status: "lost", payoutFactor: 0 };
  if (results.every((r) => r === "push")) return { status: "push", payoutFactor: 1 };
  const factor = selections.reduce(
    (acc, s, i) => acc * (results[i] === "push" ? 1 : (s.oddValue ?? 1)), 1);
  return { status: "won", payoutFactor: factor };
}
