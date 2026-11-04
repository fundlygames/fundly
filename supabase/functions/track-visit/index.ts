// track-visit — bezcookiová návštěvnost pro stránku investorů (investors.html).
// POST (text/plain JSON) { path, src?, w?, lang? } z js/track.js. Neukládá IP ani identifikátor, který by šel
// zpětně dohledat: unikátní návštěvník = denní hash(IP + prohlížeč + den + sůl), IP se zahodí.
// Země se bere z hlavičky cf-ipcountry. Boti a "Do Not Track" se přeskakují.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|go-http|java\//i;
const SKIP_PATH = /^\/(admin|investors)(\.html)?(\/|$)/i;

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ ok: true });

  try {
    if (req.headers.get("dnt") === "1") return jsonResponse({ ok: true });
    const ua = req.headers.get("user-agent") ?? "";
    if (!ua || BOT.test(ua)) return jsonResponse({ ok: true });

    const raw = await req.text();
    // deno-lint-ignore no-explicit-any
    let body: any = {};
    try { body = JSON.parse(raw || "{}"); } catch { /* ignore */ }

    let path = String(body.path ?? "/").split(/[?#]/)[0].slice(0, 120) || "/";
    if (!path.startsWith("/")) path = "/" + path;
    path = path.replace(/\.html$/i, "").replace(/\/index$/i, "/") || "/";
    if (SKIP_PATH.test(path)) return jsonResponse({ ok: true });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("cf-connecting-ip") ?? "";
    const cc = (req.headers.get("cf-ipcountry") ?? "").toUpperCase();
    // země: z hlavičky CDN, jinak orientační údaj z prohlížeče (časové pásmo/jazyk — viz js/track.js).
    // IP se nikam dál neposílá a neukládá.
    const hint = String(body.cc ?? "").toUpperCase();
    const country = /^[A-Z]{2}$/.test(cc) && cc !== "XX" && cc !== "T1" ? cc : /^[A-Z]{2}$/.test(hint) ? hint : null;

    const w = Number(body.w) || 0;
    const device = w > 0 && w < 768 ? "mobile" : w > 0 && w < 1100 ? "tablet" : w > 0 ? "desktop" : /mobile|android|iphone/i.test(ua) ? "mobile" : "desktop";
    const source = String(body.src ?? "").toLowerCase().replace(/^www\./, "").replace(/[^a-z0-9._\- ]/g, "").slice(0, 40) || null;
    const lang = /^[a-z]{2}$/i.test(String(body.lang ?? "").slice(0, 2)) ? String(body.lang).slice(0, 2).toLowerCase() : null;

    const day = new Date().toISOString().slice(0, 10);
    const salt = Deno.env.get("VISIT_SALT") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "fundly";
    const vid = (await sha256Hex(`${ip}|${ua}|${day}|${salt}`)).slice(0, 16);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await supabase.from("site_visits").insert({ path, country, source, device, lang, vid });
    if (error) console.error("track-visit insert:", error.message);
    return jsonResponse({ ok: true });
  } catch (e) {
    console.error("track-visit:", e);
    return jsonResponse({ ok: true });
  }
});
