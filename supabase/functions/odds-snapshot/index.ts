// odds-snapshot — cron (každých ~15 min): uloží kurzy zápasů, na které mají
// hráči otevřené (pending) tikety. Podklad pro FEED_LAG_PATTERN a HIGH_CLV
// v risk.ts. Chráněno x-admin-key.
//
// Plánování (Supabase dashboard → Database → Cron, nebo přes stejný
// cron.schedule vzor jako account-maintenance):
//   select cron.schedule('odds-snapshot-15min', '*/15 * * * *', $$
//     select net.http_post(
//       url := 'https://<ref>.supabase.co/functions/v1/odds-snapshot',
//       headers := '{"Content-Type":"application/json","x-admin-key":"..."}'::jsonb,
//       body := '{}'::jsonb
//     );
//   $$);
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { isValidAdminKey } from "../_shared/admin.ts";

const API_BASE = "https://api.odds-api.io/v3";

// deno-lint-ignore no-explicit-any
async function fetchOddsMulti(eventIds: string[], apiKey: string, bookmaker: string): Promise<any[]> {
  if (!eventIds.length) return [];
  const q = new URLSearchParams({ eventIds: eventIds.join(","), bookmakers: bookmaker, apiKey });
  const res = await fetch(`${API_BASE}/odds/multi?${q}`);
  if (!res.ok) return [];
  return res.json();
}

type Selection = { eventId: string | null; marketName: string | null; field: string | null; hdp?: number | null };

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!(await isValidAdminKey(req))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const apiKey = Deno.env.get("ODDS_API_KEY");
  // Plán je omezený na max 2 bookmakery — stejný fallback pořadí jako
  // js/dashboard.js (loadSportEvents), ať se snapshoty berou ze stejného
  // zdroje kurzů, ze kterého hráč reálně sázel.
  const bookmakers = (Deno.env.get("ODDS_API_BOOKMAKER") ?? "Bet365,Sportsbet.com.au").split(",").map((b) => b.trim());
  if (!apiKey) return jsonResponse({ skipped: true, reason: "ODDS_API_KEY not set" });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // tikety čekající na vyhodnocení, jejichž zápas začíná v příštích 6 hodinách
    // (dřív než to nemá smysl sledovat, kurzy se ještě moc nehýbou)
    const { data: pending } = await supabase
      .from("tickets")
      .select("selections")
      .eq("status", "pending")
      .limit(500);

    const now = Date.now();
    const windowEnd = now + 6 * 3600 * 1000;
    const selections: Selection[] = [];
    for (const t of pending ?? []) {
      for (const s of (t.selections ?? []) as (Selection & { startTime?: string })[]) {
        if (!s.eventId || !s.startTime) continue;
        const start = new Date(s.startTime).getTime();
        if (start >= now - 3600 * 1000 && start <= windowEnd) selections.push(s);
      }
    }
    const eventIds = [...new Set(selections.map((s) => s.eventId).filter(Boolean))] as string[];
    if (!eventIds.length) return jsonResponse({ ok: true, events: 0, snapshots: 0 });

    // deno-lint-ignore no-explicit-any
    function pickMarkets(ev: any): any[] {
      for (const bm of bookmakers) {
        const markets = (ev.bookmakers && ev.bookmakers[bm]) || [];
        if (markets.length) return markets;
      }
      return [];
    }

    const rows: { event_id: string; market_name: string; field: string; hdp: number | null; odd_value: number }[] = [];
    for (let i = 0; i < eventIds.length; i += 10) {
      const chunk = await fetchOddsMulti(eventIds.slice(i, i + 10), apiKey, bookmakers.join(","));
      for (const ev of chunk) {
        const markets = pickMarkets(ev);
        // ML: nejjednodušší trh, žádné hdp matchování — home/draw/away rovnou.
        const ml = markets.find((m: { name: string }) => m.name === "ML");
        const mlRow = ml?.odds?.[0];
        if (mlRow) {
          for (const field of ["home", "draw", "away"]) {
            if (typeof mlRow[field] === "number") {
              rows.push({ event_id: ev.id, market_name: "ML", field, hdp: null, odd_value: mlRow[field] });
            }
          }
        }
        // Totals/Spread/BTTS: uložíme jen řádky odpovídající hdp, které hráči
        // skutečně mají v otevřeném tiketu na tenhle event (jinak by šlo o
        // desítky řádků na zápas zbytečně).
        const relevantSelections = selections.filter((s) => s.eventId === ev.id && s.marketName !== "ML");
        for (const sel of relevantSelections) {
          const market = markets.find((m: { name: string }) => m.name === sel.marketName);
          if (!market?.odds) continue;
          // deno-lint-ignore no-explicit-any
          const row = market.odds.find((r: any) => sel.hdp == null || Number(r.hdp) === Number(sel.hdp)) ?? market.odds[0];
          if (row && sel.field && typeof row[sel.field] === "number") {
            rows.push({ event_id: ev.id, market_name: sel.marketName!, field: sel.field, hdp: sel.hdp ?? null, odd_value: row[sel.field] });
          }
        }
      }
    }

    if (rows.length) {
      const { error } = await supabase.from("odds_snapshots").insert(rows);
      if (error) throw error;
    }

    return jsonResponse({ ok: true, events: eventIds.length, snapshots: rows.length });
  } catch (err) {
    console.error("odds-snapshot error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Snapshot failed." },
      500,
    );
  }
});
