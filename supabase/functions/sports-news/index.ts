// sports-news — športové novinky pro dashboard (sekce Novinky). Veřejná, bez JWT.
// Stahuje veřejné RSS kanály sportovních webů. Vrací jen to, co vydavatelé v RSS sami nabízejí
// k převzetí: titulek, krátký úvod (perex, zkrácený), náhledový obrázek, zdroj, čas a odkaz.
// Celý text článků NEPŘEBÍRÁME (autorská práva) — čtenář jde na web zdroje.
// Obsah o sázení (např. sekce iDNES „Sázení“) se vyřazuje — Fundly se nemá spojovat s hazardem.
// Cache 15 min (tabulka odds_cache, klíč news:<lang>) + paměť instance; při výpadku zdrojů
// vrací poslední uložená data.
// GET ?lang=cs|en  (sk → cs, ostatní → en)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const FEEDS: Record<"cs" | "en", { name: string; url: string }[]> = {
  cs: [
    { name: "iSport", url: "https://isport.blesk.cz/rss" },
    { name: "Sport.cz", url: "https://www.sport.cz/rss" },
    { name: "iDNES Sport", url: "https://www.idnes.cz/sport/rss" },
    { name: "Aktuálně Sport", url: "https://sport.aktualne.cz/rss/" },
  ],
  en: [
    { name: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml" },
    { name: "ESPN", url: "https://www.espn.com/espn/rss/news" },
    { name: "Sky Sports", url: "https://www.skysports.com/rss/12040" },
  ],
};
const TTL_S = 15 * 60;
const MAX_ITEMS = 80;

type Item = { title: string; link: string; source: string; published: string | null; summary: string; image: string | null; sport: string };

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const mem = new Map<string, { t: number; body: string }>();

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
};

// sport z adresy článku / kategorie RSS (pro filtry v dashboardu)
const SPORT_RULES: [string, RegExp][] = [
  ["amfootball", /\bnfl\b|college-football|american-football|\bncaaf?\b|super-bowl/i],
  ["football", /fotbal|football|soccer|premier-league|liga-mistr|champions|\/fotbal|uefa|fifa/i],
  ["hockey", /hokej|hockey|nhl|\/hokej|extraliga/i],
  ["tennis", /tenis|tennis|wimbledon|atp|wta|roland|us-open/i],
  ["basketball", /basket|nba|euroleague/i],
  ["mma", /mma|ufc|oktagon|box|boxing|wrestling|raf/i],
  ["motorsport", /formul|f1|formula-1|motorsport|moto-gp|motogp|rallye|rally/i],
  ["esports", /esport|e-sport|counter-strike|league-of-legends|dota/i],
];
function sportOf(link: string, title: string, cats: string): string {
  const hay = `${link} ${cats} ${title}`;
  for (const [k, re] of SPORT_RULES) if (re.test(hay)) return k;
  return "other";
}
const BETTING = /sazeni\.|\/sazeni|\/sazky|sázen|sázk|betting|\/bet\b/i;

async function fetchFeed(f: { name: string; url: string }): Promise<Item[]> {
  const res = await fetch(f.url, { headers: { "User-Agent": "FundlyNewsBot/1.0 (+https://fundly.games)" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${f.name} HTTP ${res.status}`);
  const xml = await res.text();
  const items: Item[] = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const it = m[0];
    const title = tag(it, "title");
    let link = tag(it, "link");
    if (!link) { const g = it.match(/<guid[^>]*>(https?:[^<]+)<\/guid>/i); if (g) link = decode(g[1]); }
    if (!title || !/^https:\/\//.test(link)) continue;
    const cats = [...it.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((c) => decode(c[1])).join(" ");
    if (BETTING.test(link) || BETTING.test(cats)) continue; // obsah o sázení vynechat
    const d = new Date(tag(it, "pubDate") || tag(it, "dc:date"));
    const rawDesc = (it.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || "";
    let summary = decode(rawDesc);
    if (summary.length > 240) summary = summary.slice(0, 240).replace(/\s+\S*$/, "") + "…";
    const imgM = it.match(/<(?:media:content|media:thumbnail|enclosure)[^>]*url="([^"]+)"/i) || rawDesc.match(/<img[^>]+src="([^"]+)"/i)
      || decode(rawDesc).match(/(https:\/\/\S+\.(?:jpe?g|png|webp))/i);
    const image = imgM && /^https:\/\//.test(imgM[1].replace(/&amp;/g, "&")) ? imgM[1].replace(/&amp;/g, "&") : null;
    items.push({
      title: title.slice(0, 220), link, source: f.name,
      published: Number.isNaN(d.getTime()) ? null : d.toISOString(),
      summary: summary === title ? "" : summary, image, sport: sportOf(link, title, cats),
    });
    if (items.length >= 25) break;
  }
  return items;
}

async function build(lang: "cs" | "en"): Promise<{ items: Item[]; at: string }> {
  const lists = await Promise.allSettled(FEEDS[lang].map(fetchFeed));
  const seen = new Set<string>();
  const all: Item[] = [];
  for (const l of lists) {
    if (l.status !== "fulfilled") { console.error("sports-news feed:", l.reason); continue; }
    for (const it of l.value) {
      const k = it.title.toLowerCase();
      if (seen.has(k) || seen.has(it.link)) continue;
      seen.add(k); seen.add(it.link);
      all.push(it);
    }
  }
  if (!all.length) throw new Error("no feed available");
  all.sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
  return { items: all.slice(0, MAX_ITEMS), at: new Date().toISOString() };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  const raw = (new URL(req.url).searchParams.get("lang") ?? "en").slice(0, 2).toLowerCase();
  const lang: "cs" | "en" = raw === "cs" || raw === "sk" ? "cs" : "en";
  const key = `news2:${lang}`; // v2: perex, obrázek, sport
  const now = Date.now();
  const headers = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" };

  let stored = mem.get(key) ?? null;
  if (!stored) {
    const { data } = await db.from("odds_cache").select("body, fetched_at").eq("key", key).maybeSingle();
    if (data) { stored = { t: new Date(data.fetched_at).getTime(), body: data.body }; mem.set(key, stored); }
  }
  if (stored && now - stored.t < TTL_S * 1000) return new Response(stored.body, { headers });

  try {
    const body = JSON.stringify(await build(lang));
    mem.set(key, { t: now, body });
    await db.from("odds_cache").upsert({ key, body, fetched_at: new Date(now).toISOString() });
    return new Response(body, { headers });
  } catch (e) {
    console.error("sports-news:", e);
    if (stored) return new Response(stored.body, { headers }); // poslední dobrá data
    return new Response(JSON.stringify({ items: [], error: "News are temporarily unavailable." }), { status: 502, headers });
  }
});
