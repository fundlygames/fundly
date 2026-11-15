// sports-news — športové novinky pro dashboard (sekce Novinky). Veřejná, bez JWT.
// Stahuje veřejné RSS kanály sportovních webů, vrací JEN titulek, odkaz, zdroj a čas
// (žádný text článku ani obrázky — autorská práva; čtenář jde na web zdroje).
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
const MAX_ITEMS = 60;

type Item = { title: string; link: string; source: string; published: string | null };

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
    const d = new Date(tag(it, "pubDate") || tag(it, "dc:date"));
    items.push({ title: title.slice(0, 220), link, source: f.name, published: Number.isNaN(d.getTime()) ? null : d.toISOString() });
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
  const key = `news:${lang}`;
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
