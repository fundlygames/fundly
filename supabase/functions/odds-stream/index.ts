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

async function run(apiKey: string) {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const started = Date.now();
  const deadline = started + RUN_S * 1000;
  const stats = { msgs: 0, updates: 0, removed: 0, settled: 0, upserted: 0, flushes: 0, errors: [] as string[], connects: 0, closes: [] as string[], replay: null as string | null };

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
