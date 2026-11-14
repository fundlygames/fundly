// odds-feed — sdílená cache kurzů z odds-api.io pro všechny hráče (veřejná, bez JWT).
//
// Proč: klient dřív volal odds-api přímo se sdíleným klíčem. Kvóta (5000 req/h) se tak
// dělila mezi všechny hráče a jeden hráč spotřeboval ~13 požadavků na každý otevřený
// sport → při náporu hráčů by během minut došla, nikdo by neviděl zápasy a server by
// nemohl vyhodnocovat tikety (používá stejný klíč).
// Teď funkce stáhne data jednou za TTL, uloží je (paměť instance + tabulka odds_cache,
// migrace 037) a všichni hráči čtou totéž. Spotřeba kvóty nezávisí na počtu hráčů.
// Když odds-api selže nebo vrátí 429, vrátí se poslední uložená data (stale), ať hráči
// nevidí prázdnou nabídku.
//
// GET ?bundle=1&sport=<slug>&live=0|1
//      → { events, odds } — vše, co dashboard potřebuje pro jeden sport (loadSportEvents)
// GET ?path=/events/<id> | /odds/multi | /value-bets  (+ parametry jako u odds-api)
//      → odpověď odds-api 1:1 (kontrola tiketu před potvrzením, vyhodnocení, value-bets)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const UPSTREAM = "https://api.odds-api.io/v3";
const SPORTS = new Set(["basketball", "football", "ice-hockey", "esports", "table-tennis", "tennis", "darts", "baseball", "mixed-martial-arts"]);
const EVENTS_PER_SPORT = 100;
// stejné jako PRIORITY_LEAGUES v js/dashboard.js (top ligy, které se v obecném výpisu ztrácejí)
const PRIORITY_LEAGUES: Record<string, string[]> = {
  football: [
    "england-premier-league", "spain-laliga", "italy-serie-a", "germany-bundesliga", "france-ligue-1",
    "international-clubs-uefa-champions-league",
    "international-uefa-nations-league-league-a-gr-3", "international-uefa-nations-league-league-b-gr-4",
    "international-uefa-nations-league-league-c-gr-2", "international-uefa-nations-league-league-c-gr-3",
    "international-uefa-nations-league-league-c-gr-4", "international-uefa-nations-league-league-d-gr-2",
  ],
  basketball: ["international-euroleague"],
  "ice-hockey": ["usa-nhl"],
};
// LIVE: kurzy se v živých zápasech mění zhruba každých ~25 s a odds-api je má čerstvé v mediánu ~9 s
// (měřeno 14. 11.) → živý seznam max. LIVE_TTL_S starý. fresh=1 (kontrola tiketu těsně před
// podáním) jde skoro přímo na odds-api (2 s jen proti souběžným duplicitám).
const LIVE_TTL_S = Math.max(5, Number(Deno.env.get("ODDS_LIVE_TTL_S") ?? "12") || 12);
const TTL = { bundle: 240, bundleLive: LIVE_TTL_S, event: 60, multi: 45, valueBets: 240, fresh: 2 }; // sekundy
const LIVE_RESCAN_S = 600; // jak často znovu projít VŠECHNY živé zápasy, jestli k nim mezitím nepřibyly kurzy
const STALE_MAX_S = 6 * 3600; // starší data už raději nevracet

const apiKey = Deno.env.get("ODDS_API_KEY") ?? "";
const BOOKMAKERS = (Deno.env.get("ODDS_API_BOOKMAKER") ?? "Bet365,Sportsbet.com.au").split(",").map((b) => b.trim()).join(",");
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Trhy, které dashboard umí vyhodnotit (= GRADEABLE_MARKETS v js/dashboard.js). odds-api
// u fotbalu posílá stovky dalších trhů (~7 MB na sport), které klient stejně zahodí —
// ořezáním je odpověď řádově menší a na mobilu rychlá.
const GRADEABLE = new Set([
  "ML", "ML HT", "Half Time Result", "Totals", "Goals Over/Under", "Totals HT",
  "Alternative Goal Line", "Alternative Total Goals", "Alternative 1st Half Goal Line",
  "Both Teams To Score", "Spread", "Spread HT", "Alternative Asian Handicap",
  "Alternative 1st Half Asian Handicap", "European Handicap", "Draw No Bet",
  "Double Chance", "Double Chance HT", "Odd/Even", "Odd/Even HT", "Odd/Even 2H",
]);
const ALLOWED_BMS = new Set(BOOKMAKERS.split(","));
// deno-lint-ignore no-explicit-any
function trimOdds(list: any): any {
  if (!Array.isArray(list)) return list;
  return list.map((ev) => {
    // deno-lint-ignore no-explicit-any
    const bms: Record<string, any[]> = {};
    for (const [bm, markets] of Object.entries(ev.bookmakers ?? {})) {
      if (!ALLOWED_BMS.has(bm) || !Array.isArray(markets)) continue;
      bms[bm] = markets.filter((m) => m && GRADEABLE.has(m.name));
    }
    const { urls: _u, ...rest } = ev;
    return { ...rest, bookmakers: bms };
  });
}

type Entry = { t: number; body: string };
const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<string>>();

class UpstreamError extends Error {
  constructor(public status: number) { super(`odds-api HTTP ${status}`); }
}

async function upstream(path: string, params: Record<string, string>): Promise<unknown> {
  const q = new URLSearchParams({ ...params, apiKey });
  const res = await fetch(`${UPSTREAM}${path}?${q}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new UpstreamError(res.status);
  return res.json();
}

async function readStored(key: string): Promise<Entry | null> {
  const m = mem.get(key);
  if (m) return m;
  const { data } = await db.from("odds_cache").select("body, fetched_at").eq("key", key).maybeSingle();
  if (!data) return null;
  const e = { t: new Date(data.fetched_at).getTime(), body: data.body as string };
  mem.set(key, e);
  return e;
}

// Vrátí { body, stale } — čerstvá data z cache, nebo nově stažená, nebo při chybě poslední uložená.
async function cached(key: string, ttlS: number, produce: () => Promise<unknown>, staleMaxS = STALE_MAX_S): Promise<{ body: string; age: number; stale: boolean }> {
  const now = Date.now();
  const stored = await readStored(key);
  if (stored && now - stored.t < ttlS * 1000) return { body: stored.body, age: Math.round((now - stored.t) / 1000), stale: false };

  // stale-while-revalidate: máme data mladší než 3× TTL → vrátit je hned a obnovit na pozadí,
  // ať žádný hráč nečeká na odds-api (u fotbalu ~7 s)
  // (len pre-match / pomalé dáta — živé kurzy a kontrola tiketu (TTL < 60 s) vždy čerstvé)
  if (ttlS >= 60 && stored && now - stored.t < ttlS * 3000) {
    if (!inflight.has(key)) {
      const bg = refresh(key, produce).catch(() => {});
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime;
      if (rt && typeof rt.waitUntil === "function") rt.waitUntil(bg);
    }
    return { body: stored.body, age: Math.round((now - stored.t) / 1000), stale: false };
  }

  try {
    return { body: await refresh(key, produce), age: 0, stale: false };
  } catch (err) {
    if (stored && now - stored.t < staleMaxS * 1000) {
      return { body: stored.body, age: Math.round((now - stored.t) / 1000), stale: true };
    }
    throw err;
  }
}

function refresh(key: string, produce: () => Promise<unknown>): Promise<string> {
  let p = inflight.get(key);
  if (!p) {
    p = (async () => {
      const body = JSON.stringify(await produce());
      const e = { t: Date.now(), body };
      mem.set(key, e);
      if (mem.size > 400) mem.delete(mem.keys().next().value!); // jednoduchý strop paměti
      // čerstvé kontroly tiketu ("f…") do DB neukládat — žijí 2 s a jen by plnily tabulku
      if (!key.startsWith("f")) await db.from("odds_cache").upsert({ key, body, fetched_at: new Date(e.t).toISOString() });
      return body;
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

// Živé zápasy: odds-api jich vrací stovky (fotbal ~400), ale kurzy od našich bookmakerů má
// jen pár desítek. Plný průchod (40 požadavků) se proto dělá jen jednou za LIVE_RESCAN_S;
// mezi tím se každých LIVE_TTL_S stahují kurzy jen pro zápasy, které je mají, + pro nově
// začaté zápasy. Bez toho by jedno obnovení živého fotbalu stálo ~40 požadavků.
type Coverage = { t: number; scanned: Set<string>; withOdds: Set<string> };
const coverage = new Map<string, Coverage>();

// deno-lint-ignore no-explicit-any
async function fetchOddsFor(ids: string[]): Promise<any[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
  // deno-lint-ignore no-explicit-any
  const odds: any[] = [];
  for (let i = 0; i < chunks.length; i += 4) { // max 4 souběžně, ať nebijeme odds-api
    const part = await Promise.all(chunks.slice(i, i + 4).map((c) =>
      upstream("/odds/multi", { eventIds: c.join(","), bookmakers: BOOKMAKERS })));
    for (const p of part) if (Array.isArray(p)) odds.push(...trimOdds(p));
  }
  return odds;
}

async function buildBundle(sport: string, live: boolean) {
  const to = new Date(Date.now() + 20 * 864e5).toISOString();
  // deno-lint-ignore no-explicit-any
  const events: any[] = (await upstream(live ? "/events/live" : "/events", live
    ? { sport }
    : { sport, status: "pending", limit: String(EVENTS_PER_SPORT), to })) as any[];
  // prioritní ligy jen pre-match: /events/live vrací celý (malý) živý výpis, nic se v něm neztrácí
  const leagues = live ? [] : (PRIORITY_LEAGUES[sport] ?? []);
  if (leagues.length) {
    const seen = new Set(events.map((e) => e.id));
    const lists = await Promise.all(leagues.map((league) =>
      upstream("/events", { sport, league, status: "pending", limit: "20", to }).catch(() => [])));
    // deno-lint-ignore no-explicit-any
    for (const list of lists as any[][]) for (const e of list) if (!seen.has(e.id)) { seen.add(e.id); events.push(e); }
  }
  const ids = events.map((e) => String(e.id));
  if (!live) return { events, odds: await fetchOddsFor(ids) };

  const now = Date.now();
  let cov = coverage.get(sport);
  const full = !cov || now - cov.t > LIVE_RESCAN_S * 1000;
  const want = full ? ids : ids.filter((id) => cov!.withOdds.has(id) || !cov!.scanned.has(id));
  const odds = await fetchOddsFor(want);
  // deno-lint-ignore no-explicit-any
  const has = (e: any) => Object.values(e.bookmakers ?? {}).some((ms) => Array.isArray(ms) && ms.length);
  if (full || !cov) cov = { t: now, scanned: new Set(), withOdds: new Set() };
  for (const id of want) { cov.scanned.add(id); cov.withOdds.delete(id); }
  for (const e of odds) if (has(e)) cov.withOdds.add(String(e.id));
  coverage.set(sport, cov);
  return { events, odds };
}

function reply(r: { body: string; age: number; stale: boolean }, maxAge: number): Response {
  return new Response(r.body, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${Math.min(maxAge, 30)}`,
      "X-Cache-Age": String(r.age),
      "X-Cache-Stale": r.stale ? "1" : "0",
    },
  });
}
const err = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "GET") return err(405, "Method not allowed");
  if (!apiKey) return err(503, "ODDS_API_KEY not set");
  const u = new URL(req.url);
  const p = u.searchParams;

  try {
    if (p.get("bundle")) {
      const sport = p.get("sport") ?? "";
      if (!SPORTS.has(sport)) return err(400, "Unknown sport");
      const live = p.get("live") === "1";
      const ttl = live ? TTL.bundleLive : TTL.bundle;
      return reply(await cached(`bundle2:${sport}:${live ? 1 : 0}`, ttl, () => buildBundle(sport, live), live ? 60 : STALE_MAX_S), ttl);
    }

    const path = p.get("path") ?? "";
    const one = /^\/events\/(\d{1,15})$/.exec(path);
    const fresh = p.get("fresh") === "1";
    if (one) {
      const ttl = fresh ? TTL.fresh : TTL.event;
      return reply(await cached(`${fresh ? "f" : ""}event:${one[1]}`, ttl, () => upstream(path, {}), fresh ? 0 : STALE_MAX_S), ttl);
    }
    if (path === "/odds/multi") {
      const ids = (p.get("eventIds") ?? "").split(",").filter((x) => /^\d{1,15}$/.test(x)).slice(0, 10);
      if (!ids.length) return err(400, "eventIds required");
      const key = `${fresh ? "f" : ""}multi2:${[...ids].sort().join(",")}`;
      const ttl = fresh ? TTL.fresh : TTL.multi;
      return reply(await cached(key, ttl, () => upstream("/odds/multi", { eventIds: ids.join(","), bookmakers: BOOKMAKERS }).then(trimOdds), fresh ? 0 : 120), ttl);
    }
    if (path === "/value-bets") {
      const bm = (p.get("bookmaker") ?? "Bet365").replace(/[^A-Za-z0-9 .]/g, "").slice(0, 40);
      return reply(await cached(`vb:${bm}`, TTL.valueBets, () => upstream("/value-bets", { bookmaker: bm })), TTL.valueBets);
    }
    return err(400, "Unsupported path");
  } catch (e) {
    const status = e instanceof UpstreamError ? (e.status === 404 ? 404 : 502) : 502;
    return err(status, e instanceof Error ? e.message : "upstream error");
  }
});
