// odds-stream — relé živých kurzů z WebSocketu odds-api.io do tabulky live_odds (migrace 038).
//
// Proč: živé kurzy se mění zhruba každých ~25 s. WebSocket je posílá ~1 s po změně u
// bookmakera a nespotřebovává hodinovou kvótu REST požadavků. Na jeden API klíč jsou ale
// povolená jen 2 souběžná spojení, takže se prohlížeče hráčů připojit nemůžou — drží ho
// tahle funkce a každou změnu zapíše do DB; dashboard si každé ~2 s stáhne jen změněné řádky.
//
// Spouští ji cron každou minutu (x-admin-key), funkce odpoví hned a na pozadí drží spojení
// ~RUN_S sekund (víc než minutu) → běhy se překrývají, stream nemá mezery.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import WebSocket from "npm:ws@8.18.0";
import { jsonResponse } from "../_shared/cors.ts";
import { isValidAdminKey } from "../_shared/admin.ts";

// Každý běh drží spojení ~115 s a cron ho spouští každou minutu → běhy se překrývají a vždy
// běží aspoň jedno spojení (odds-api povoluje 2 na klíč). Navazování přes lastSeq jsme
// opustili: při připojení každou minutu odds-api střídá "snapshot" a "live" (= nic
// zmeškaného nepošle), takže by se stav ztrácel. Překryv žádnou mezeru nemá.
const RUN_S = Math.min(140, Math.max(20, Number(Deno.env.get("ODDS_STREAM_RUN_S") ?? "115") || 115));
const HEARTBEAT_GAP_S = 20; // když nikdo nezapsal heartbeat déle → byla mezera → řádky můžou být zastaralé
const SPORTS = ["basketball", "football", "ice-hockey", "esports", "table-tennis", "tennis", "darts", "baseball", "mixed-martial-arts"];
// = GRADEABLE_MARKETS v js/dashboard.js (max. 40 trhů na spojení)
const MARKETS = [
  "ML", "ML HT", "Half Time Result", "Totals", "Goals Over/Under", "Totals HT",
  "Alternative Goal Line", "Alternative Total Goals", "Alternative 1st Half Goal Line",
  "Both Teams To Score", "Spread", "Spread HT", "Alternative Asian Handicap",
  "Alternative 1st Half Asian Handicap", "European Handicap", "Draw No Bet",
  "Double Chance", "Double Chance HT", "Odd/Even", "Odd/Even HT", "Odd/Even 2H",
];
const MARKET_SET = new Set(MARKETS);

type Row = { event_id: string; bookie: string; ml: unknown; markets: unknown[]; seq: number | null; updated_at: string };

// Historie ML kurzů (tabulka odds_history, migrace 042) pro graf pohybu kurzu v detailu zápasu.
// Max. 1 řádek na zápas × bookmaker za HIST_BUCKET_MS: drží se jen poslední změněná hodnota
// a zapíše se v běžném 1s flush, jakmile začne nové 30s okno. ts = začátek okna, takže
// překrývající se běhy (dvě spojení naráz) zapíšou stejné okno jen jednou (unikátní index).
const HIST_BUCKET_MS = 30_000;
const HIST_RETENTION_MS = 7 * 864e5;
type HistPending = { event_id: string; bookie: string; sig: string; home: number; draw: number | null; away: number };
const oddNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n > 1 ? n : null;
};

async function run(apiKey: string) {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const started = Date.now();
  const deadline = started + RUN_S * 1000;
  const stats = { msgs: 0, updates: 0, removed: 0, settled: 0, upserted: 0, flushes: 0, history: 0, errors: [] as string[], connects: 0, closes: [] as string[], replay: null as string | null };

  // Mezera ve streamu (předchozí běh spadl / cron stál)? Pak řádky můžou být zastaralé
  // (stažený trh, o kterém jsme se nedozvěděli) → smazat; dashboard do příchodu nových
  // zpráv bere REST snímek z odds-feed.
  const { data: st } = await db.from("odds_stream_state").select("updated_at").eq("id", 1).maybeSingle();
  const gap = !st?.updated_at || Date.now() - new Date(st.updated_at).getTime() > HEARTBEAT_GAP_S * 1000;
  if (gap) await db.from("live_odds").delete().lt("updated_at", new Date().toISOString());
  let lastSeq: number | null = null; // jen pro statistiku
  const pending = new Map<string, Row>();
  const settled = new Set<string>();
  let resync = false;

  // historie: poslední ZAPSANÁ hodnota (sig + 30s okno) a čekající změna na zápas × bookmaker.
  // Při připojení pošle WS snímek všech živých zápasů — aby každý běh (každou minutu) znovu
  // nezapsal stovky nezměněných kurzů, výchozí stav se vezme z live_odds (= poslední známé ML).
  const histLast = new Map<string, { b: number; sig: string }>();
  const histPending = new Map<string, HistPending>();
  let histOff = false; // tabulka chybí (migrace 042 neproběhla) → historii vypnout, stream jede dál
  if (!gap) {
    const { data: seed } = await db.from("live_odds").select("event_id,bookie,ml").limit(5000);
    for (const r of seed ?? []) {
      // deno-lint-ignore no-explicit-any
      const ml = r.ml as any;
      const h = oddNum(ml?.home), a = oddNum(ml?.away);
      if (h && a) histLast.set(`${r.event_id}|${r.bookie}`, { b: 0, sig: `${h}|${oddNum(ml?.draw) ?? ""}|${a}` });
    }
  }
  // deno-lint-ignore no-explicit-any
  function noteHistory(eventId: string, bookie: string, mlRow: any) {
    const home = oddNum(mlRow?.home), away = oddNum(mlRow?.away), draw = oddNum(mlRow?.draw);
    if (!home || !away) return; // trh stažený / neúplný → do historie nic
    const key = `${eventId}|${bookie}`;
    const sig = `${home}|${draw ?? ""}|${away}`;
    if (histLast.get(key)?.sig === sig) { histPending.delete(key); return; } // vrátil se na zapsanou hodnotu
    histPending.set(key, { event_id: eventId, bookie, sig, home, draw, away });
  }

  let lastBeat = 0;
  let connected = false;
  async function flush() {
    if (connected && Date.now() - lastBeat > 5000) { // heartbeat jen při živém spojení
      lastBeat = Date.now();
      await db.from("odds_stream_state").update({ updated_at: new Date().toISOString(), last_seq: lastSeq }).eq("id", 1);
    }
    if (resync) {
      resync = false;
      await db.from("live_odds").delete().lt("updated_at", new Date(Date.now() - 1000).toISOString());
      stats.errors.push("resync: live_odds cleared");
    }
    if (pending.size) {
      const rows = [...pending.values()];
      pending.clear();
      const { error } = await db.from("live_odds").upsert(rows, { onConflict: "event_id,bookie" });
      if (error) stats.errors.push("upsert: " + error.message); else stats.upserted += rows.length;
      stats.flushes++;
    }
    if (histPending.size && !histOff) {
      const b = Math.floor(Date.now() / HIST_BUCKET_MS);
      const rows = [];
      for (const [key, p] of histPending) {
        if ((histLast.get(key)?.b ?? -1) >= b) continue; // v tomhle 30s okně už zapsáno → počkat na další
        histPending.delete(key);
        histLast.set(key, { b, sig: p.sig });
        rows.push({ event_id: p.event_id, bookie: p.bookie, ts: new Date(b * HIST_BUCKET_MS).toISOString(), home: p.home, draw: p.draw, away: p.away });
      }
      if (rows.length) {
        const { error } = await db.from("odds_history").upsert(rows, { onConflict: "event_id,ts,bookie", ignoreDuplicates: true });
        if (error) { histOff = /odds_history|does not exist|schema cache/i.test(error.message); stats.errors.push("history: " + error.message); }
        else stats.history += rows.length;
      }
    }
    if (settled.size) {
      const ids = [...settled];
      settled.clear();
      await db.from("live_odds").delete().in("event_id", ids);
    }
  }

  function handle(raw: string) {
    // deno-lint-ignore no-explicit-any
    let d: any;
    try { d = JSON.parse(raw); } catch { return; }
    stats.msgs++;
    const t = d.type;
    if (t === "welcome") { if (d.warning) stats.errors.push("welcome warning: " + String(d.warning).slice(0, 200)); return; }
    // Docs: když server nemůže zaručit úplný stav (resync_required, nebo navázání s lastSeq
    // skončilo jako "live" = nic zmeškaného neposlal), uložené řádky můžou být zastaralé
    // (třeba stažený trh, o kterém jsme se nedozvěděli). Bezpečné řešení: řádky smazat —
    // dashboard pak bere REST snímek z odds-feed, dokud nepřijdou nové zprávy — a lastSeq
    // zahodit (docs: "discard the last_seq you stored", nepřebírat current_seq).
    if (t === "replay_complete") {
      stats.replay = String(d.outcome);
      if (d.outcome === "resync_required") { resync = true; lastSeq = null; }
      return;
    }
    if (t === "resync_required") { stats.replay = "resync_required:" + String(d.reason ?? ""); resync = true; lastSeq = null; return; }
    if (t === "status") {
      // settled / cancelled (vč. přeplánovaného zápasu s replacedBy) → kurzy zápasu pryč
      if (d.status === "settled" || d.status === "cancelled") { settled.add(String(d.id)); stats.settled++; }
      return;
    }
    if (t !== "created" && t !== "updated" && t !== "deleted" && t !== "no_markets") return;
    if (!d.id || !d.bookie) return;
    // deno-lint-ignore no-explicit-any
    const markets = (Array.isArray(d.markets) ? d.markets : []).filter((m: any) => m && MARKET_SET.has(m.name));
    // deno-lint-ignore no-explicit-any
    const ml = markets.find((m: any) => m.name === "ML");
    if (ml && Array.isArray(ml.odds) && ml.odds[0]) noteHistory(String(d.id), String(d.bookie), ml.odds[0]);
    pending.set(`${d.id}|${d.bookie}`, {
      event_id: String(d.id),
      bookie: String(d.bookie),
      ml: ml && Array.isArray(ml.odds) && ml.odds[0] ? ml.odds[0] : null,
      markets,
      seq: typeof d.seq === "number" ? d.seq : null,
      updated_at: new Date().toISOString(),
    });
    if (markets.length) stats.updates++; else stats.removed++;
    if (typeof d.seq === "number" && (lastSeq === null || d.seq > lastSeq)) lastSeq = d.seq;
  }

  const timer = setInterval(() => { flush().catch((e) => stats.errors.push(String(e))); }, 1000);

  while (Date.now() < deadline - 3000) {
    const params = new URLSearchParams({
      apiKey, sport: SPORTS.join(","), status: "live", markets: MARKETS.join(","),
      channels: "odds,status", replayComplete: "true",
    });
    stats.connects++;
    const closed = await new Promise<string>((resolve) => {
      const ws = new WebSocket(`wss://api.odds-api.io/v3/ws?${params}`, { perMessageDeflate: true });
      const stop = setTimeout(() => { try { ws.close(1000, "run finished"); } catch { /* */ } }, Math.max(0, deadline - Date.now()));
      ws.on("open", () => { connected = true; });
      ws.on("message", (buf: { toString(): string }) => handle(buf.toString()));
      ws.on("error", (e: Error) => stats.errors.push("ws: " + e.message));
      ws.on("close", (code: number, reason: { toString(): string }) => { connected = false; clearTimeout(stop); resolve(`${code} ${reason?.toString() ?? ""}`.trim()); });
    });
    stats.closes.push(closed);
    if (Date.now() >= deadline - 3000) break;
    await new Promise((r) => setTimeout(r, closed.startsWith("1013") ? 5000 : 3000)); // backoff
  }

  clearInterval(timer);
  await flush().catch((e) => stats.errors.push(String(e)));
  // úklid: řádky, které se 6 h nezměnily (skončené zápasy bez zprávy o konci)
  await db.from("live_odds").delete().lt("updated_at", new Date(Date.now() - 6 * 3600 * 1000).toISOString());
  // retence historie kurzů (7 dní) — max. jednou za běh, a jen v běhu startujícím v minutě dělitelné 10
  // (cron spouští běh každou minutu; mazání po malých dávkách stačí ~6× za hodinu)
  if (!histOff && Math.floor(started / 60000) % 10 === 0) {
    const { error } = await db.from("odds_history").delete().lt("ts", new Date(Date.now() - HIST_RETENTION_MS).toISOString());
    if (error) stats.errors.push("history cleanup: " + error.message);
  }
  await db.from("odds_stream_state").update({
    last_seq: lastSeq,
    updated_at: new Date().toISOString(),
    stats: { ...stats, gap_at_start: gap, errors: stats.errors.slice(0, 10), ms: Date.now() - started, started_at: new Date(started).toISOString(), finished_at: new Date().toISOString() },
  }).eq("id", 1);
}

serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!(await isValidAdminKey(req))) return jsonResponse({ error: "Unauthorized" }, 401);
  const apiKey = Deno.env.get("ODDS_API_KEY");
  if (!apiKey) return jsonResponse({ skipped: true, reason: "ODDS_API_KEY not set" });
  const task = run(apiKey).catch((e) => console.error("odds-stream", e));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") { rt.waitUntil(task); return jsonResponse({ ok: true, background: true, run_s: RUN_S }, 202); }
  await task; // mimo Supabase runtime (lokální test): počkat
  return jsonResponse({ ok: true });
});
