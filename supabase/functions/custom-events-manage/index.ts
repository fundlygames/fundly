// custom-events-manage — admin správa vlastních zápasů (tabulka custom_events, migrace 036):
// sporty / zápasy, které odds-api nemá (wrestling — RAF, …). Admin tu zápas přidá s kurzy,
// upraví, skryje a po skončení zapíše výsledek; tikety pak vyhodnotí cron settle-tickets
// (do ~10 min) stejně jako u ostatních zápasů.
// Akce: list | upsert | result | hide
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { isAdminRequest } from "../_shared/admin.ts";

const SPORTS: Record<string, string> = {
  wrestling: "Wrestling",
  "mixed-martial-arts": "MMA",
  football: "Football",
  basketball: "Basketball",
  "ice-hockey": "Ice Hockey",
  tennis: "Tennis",
  esports: "Esports",
  darts: "Darts",
  "table-tennis": "Table Tennis",
  baseball: "Baseball",
};
const ODDS_MIN = 1.01;
const ODDS_MAX = 50;

function slug(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}
function odd(v: unknown): string | null {
  const n = Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < ODDS_MIN || n > ODDS_MAX) return null;
  return n.toFixed(2);
}
const clean = (v: unknown, max = 80) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, max);

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!(await isAdminRequest(req))) return jsonResponse({ error: "Nemáte oprávnění." }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  try {
    if (action === "list") {
      const { data, error } = await db.from("custom_events").select("id, sport, event, active, created_at, updated_at")
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      // počty tiketů na zápas (otevřené / všechny)
      const rows = await Promise.all((data ?? []).map(async (r) => {
        const { data: t } = await db.from("tickets").select("status, stake")
          .filter("selections", "cs", JSON.stringify([{ eventId: r.id }]));
        const pending = (t ?? []).filter((x) => x.status === "pending");
        return {
          ...r,
          tickets: (t ?? []).length,
          pending: pending.length,
          pendingStake: pending.reduce((a, x) => a + (Number(x.stake) || 0), 0),
        };
      }));
      return jsonResponse({ rows, sports: SPORTS });
    }

    if (action === "upsert") {
      const sport = String(body.sport ?? "wrestling");
      if (!SPORTS[sport]) return jsonResponse({ error: "Neznámý sport." }, 400);
      const home = clean(body.home), away = clean(body.away);
      const league = clean(body.league) || SPORTS[sport];
      if (!home || !away) return jsonResponse({ error: "Vyplňte oba soupeře." }, 400);
      const date = new Date(String(body.date ?? ""));
      if (Number.isNaN(date.getTime())) return jsonResponse({ error: "Neplatný čas začátku." }, 400);
      const oh = odd(body.oddsHome), oa = odd(body.oddsAway);
      if (!oh || !oa) return jsonResponse({ error: `Kurzy musí být čísla ${ODDS_MIN}–${ODDS_MAX}.` }, 400);
      const od = body.oddsDraw ? odd(body.oddsDraw) : null;
      if (body.oddsDraw && !od) return jsonResponse({ error: "Neplatný kurz na remízu." }, 400);

      let id = String(body.id ?? "");
      let existing = null;
      if (id) {
        const { data } = await db.from("custom_events").select("event").eq("id", id).maybeSingle();
        if (!data) return jsonResponse({ error: "Zápas nenalezen." }, 404);
        existing = data.event;
        if (existing?.status === "settled") return jsonResponse({ error: "Zápas už má výsledek — nelze upravit." }, 400);
      } else {
        if (date.getTime() < Date.now() + 60_000) return jsonResponse({ error: "Začátek musí být v budoucnu." }, 400);
        id = `fx-${slug(sport)}-${slug(home)}-${slug(away)}-${crypto.randomUUID().slice(0, 6)}`;
      }
      const ml: Record<string, string> = { home: oh, away: oa };
      if (od) ml.draw = od;
      const event = {
        ...(existing ?? {}),
        id, home, away,
        date: date.toISOString().replace(/\.\d{3}Z$/, "Z"),
        status: "pending",
        sport: { name: SPORTS[sport], slug: sport },
        league: { name: league, slug: slug(league) || slug(sport) },
        scores: { home: 0, away: 0 },
        bookmakers: { Fundly: [{ name: "ML", updatedAt: new Date().toISOString(), odds: [ml] }] },
      };
      const active = body.active === undefined ? true : !!body.active;
      const { error } = await db.from("custom_events").upsert({ id, sport, event, active, updated_at: new Date().toISOString() });
      if (error) throw error;
      return jsonResponse({ ok: true, id });
    }

    if (action === "result") {
      const id = String(body.id ?? "");
      const winner = String(body.winner ?? "");
      if (!["home", "away", "draw", "void"].includes(winner)) return jsonResponse({ error: "Neplatný výsledek." }, 400);
      const { data } = await db.from("custom_events").select("event").eq("id", id).maybeSingle();
      if (!data) return jsonResponse({ error: "Zápas nenalezen." }, 404);
      const ev = data.event ?? {};
      if (new Date(ev.date).getTime() > Date.now()) return jsonResponse({ error: "Zápas ještě nezačal." }, 400);
      // vítěz 1:0 / 0:1. Remíza 0:0 jen když se na remízu dalo tipovat (kurz X) — jinak by tipy
      // na vítěze prohrály, ač remíza nebyla v nabídce → bez skóre = vrácení vkladu (jako zrušeno).
      const hasDraw = !!ev?.bookmakers?.Fundly?.[0]?.odds?.[0]?.draw;
      const scores = winner === "home" ? { home: 1, away: 0 }
        : winner === "away" ? { home: 0, away: 1 }
        : winner === "draw" && hasDraw ? { home: 0, away: 0 }
        : null;
      const event = { ...ev, status: "settled", scores, result: winner, settledAt: new Date().toISOString() };
      const { error } = await db.from("custom_events").update({ event, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    if (action === "hide") {
      const id = String(body.id ?? "");
      const { error } = await db.from("custom_events").update({ active: !!body.active, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Neznámá akce." }, 400);
  } catch (e) {
    console.error("custom-events-manage", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Chyba serveru." }, 500);
  }
});
