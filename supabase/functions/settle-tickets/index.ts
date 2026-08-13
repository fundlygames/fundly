// settle-tickets — server-side pojistka: vyhodnotí čekající tikety, i když
// hráč nikdy znovu neotevře dashboard (klientská verze v js/portfolio.js
// běží jen při otevřené kartě). Cron každých 10 minut, chráněno x-admin-key.
//
// DŮLEŽITÉ: tohle vyhodnocuje jen zrcadlo v tabulce tickets (pro risk
// detekci). Skutečný zůstatek hráče žije v localStorage na klientovi —
// dashboard.js si při dalším připojení (sync-tickets) stáhne, co server
// mezitím vyhodnotil, a promítne to do lokálního stavu (viz Portfolio.
// applyServerSettlements). Vyhodnocovací logika je 1:1 kopie
// settleSelection() z portfolio.js (viz _shared/settle.ts) — musí zůstat
// identická, jinak by se stejný tiket mohl vyhodnotit jinak podle toho,
// kdo ho stihl vyřídit dřív.
//
// Plánování: select cron.schedule('settle-tickets-10min', '*/10 * * * *', $$
//   select net.http_post(url := '.../functions/v1/settle-tickets',
//     headers := '{"Content-Type":"application/json","x-admin-key":"..."}'::jsonb,
//     body := '{}'::jsonb);
// $$);
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { isValidAdminKey } from "../_shared/admin.ts";
import { settleSelection, type Selection } from "../_shared/settle.ts";

const API_BASE = "https://api.odds-api.io/v3";
const MAX_EVENTS_PER_RUN = 300;
const MAX_TICKETS_PER_RUN = 500;

type TicketSelection = Selection & { eventId: string | null; oddValue: number | null; startTime: string | null };
type TicketRow = {
  id: string;
  selections: TicketSelection[];
  stake: number | null;
  combined_odds: number | null;
};

type Period = { home: number; away: number } | null;
// gone = event nenalezen (odds-api.io drží historii jen ~24-48h, pak
// event navždy zmizí, i pro dávno skončené zápasy — ověřeno naostro).
type EventResult = { found: true; status: string; ft: Period; p1: Period } | { found: false };

// Bezpečnostní práh: pokud je event nenalezený A poslední výběr tiketu
// začal před víc než 30 hodinami (bezpečná rezerva před ~24-48h, kdy
// odds-api data mažou), tiket se vypořádá jako push (vklad zpět) — nikdy
// nezůstane zaseknutý navěky jen proto, že zdroj dat historii smazal.
const STALE_AFTER_MS = 30 * 3600 * 1000;

async function fetchEvent(id: string, apiKey: string): Promise<EventResult> {
  try {
    const res = await fetch(`${API_BASE}/events/${id}?apiKey=${apiKey}`);
    if (res.status === 404) return { found: false };
    if (!res.ok) throw new Error(`HTTP ${res.status}`); // transientní chyba, zkusí se příště znovu
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

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!(await isValidAdminKey(req))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const apiKey = Deno.env.get("ODDS_API_KEY");
  if (!apiKey) return jsonResponse({ skipped: true, reason: "ODDS_API_KEY not set" });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pending } = await supabase
      .from("tickets")
      .select("id, selections, stake, combined_odds")
      .eq("status", "pending")
      .order("placed_at", { ascending: true })
      .limit(MAX_TICKETS_PER_RUN);
    const tickets = (pending ?? []) as TicketRow[];
    if (!tickets.length) return jsonResponse({ ok: true, checked: 0, settled: 0 });

    const now = Date.now();
    // jen eventy, které už měly začít — u budoucích nemá smysl volat API
    const eventIds = [...new Set(
      tickets.flatMap((t) => t.selections || [])
        .filter((s) => s.eventId && s.startTime && new Date(s.startTime).getTime() <= now)
        .map((s) => s.eventId as string),
    )].slice(0, MAX_EVENTS_PER_RUN);

    const statusMap = new Map<string, EventResult>();
    for (const id of eventIds) {
      statusMap.set(id, await fetchEvent(id, apiKey));
    }

    let settledCount = 0;
    let staleCount = 0;
    const nowIso = new Date().toISOString();

    for (const ticket of tickets) {
      const selections = ticket.selections || [];
      if (!selections.length) continue;

      let hadStaleFallback = false;
      const results: ("won" | "lost" | "push" | null)[] = selections.map((s) => {
        if (!s.eventId || !s.startTime) return null;
        const startedAgo = now - new Date(s.startTime).getTime();
        if (startedAgo < 0) return null; // ještě nezačalo
        const ev = statusMap.get(s.eventId);
        const stale = startedAgo > STALE_AFTER_MS;
        if (!ev || !ev.found) {
          // event zmizel z odds-api (historie se maže po ~24-48h) — po
          // bezpečné rezervě to vypořádáme jako push, ať tiket nezůstane
          // zaseknutý navěky jen kvůli chybějícím datům u zdroje.
          if (stale) hadStaleFallback = true;
          return stale ? "push" : null;
        }
        if (ev.status !== "settled") {
          if (stale) hadStaleFallback = true;
          return stale ? "push" : null;
        }
        if (!ev.ft) return "push"; // settled, ale bez čitelného skóre → vklad zpět
        return settleSelection(s, { ft: ev.ft, p1: ev.p1 });
      });
      if (results.some((r) => r === null)) continue; // ještě není kompletně rozhodnuto
      if (hadStaleFallback) staleCount++;

      let status: "won" | "lost" | "push";
      let payout = 0;
      const stake = Number(ticket.stake) || 0;
      if (results.includes("lost")) {
        status = "lost";
      } else if (results.every((r) => r === "push")) {
        status = "push";
        payout = stake;
      } else {
        status = "won";
        const factor = selections.reduce(
          (acc, s, i) => acc * (results[i] === "push" ? 1 : (s.oddValue ?? 1)), 1);
        payout = Math.round(stake * factor);
      }

      const { error } = await supabase
        .from("tickets")
        .update({ status, payout, settled_at: nowIso })
        .eq("id", ticket.id)
        .eq("status", "pending"); // pojistka proti souběžnému zápisu
      if (!error) settledCount++;
    }

    return jsonResponse({ ok: true, checked: tickets.length, events: eventIds.length, settled: settledCount });
  } catch (err) {
    console.error("settle-tickets error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Settlement run failed." },
      500,
    );
  }
});
