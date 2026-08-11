// sync-tickets — posílá jednotlivé tikety (ne jen souhrn jako sync-account),
// podklad pro cross-account risk detekci (MULTI_ACCOUNT_COLLUSION, BOT_PATTERN,
// TIMING_ANOMALY, LOW_VARIANCE). POST { tickets: [...] } + Authorization: Bearer.
// Klient posílá jen tikety od posledního syncu (viz js/dashboard.js) — upsert
// přes unique (account_id, client_ticket_id) dovoluje bezpečný re-send.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const STATUSES = ["pending", "won", "lost", "push", "cashedout"];
const MAX_BATCH = 200;

function saneNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function saneStr(v: unknown, max: number): string | null {
  if (v == null) return null;
  return String(v).slice(0, max);
}
function saneDate(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return jsonResponse({ error: "Missing access token." }, 401);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return jsonResponse({ error: "Invalid access token." }, 401);

    const { data: account } = await supabase
      .from("challenge_accounts")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!account) return jsonResponse({ error: "You have no challenge account." }, 400);

    const body = await req.json().catch(() => ({}));
    const incoming = Array.isArray(body.tickets) ? body.tickets.slice(0, MAX_BATCH) : [];
    if (!incoming.length) return jsonResponse({ ok: true, synced: 0 });

    // deno-lint-ignore no-explicit-any
    const saneSelections = (list: any) =>
      Array.isArray(list)
        ? list.slice(0, 20).map((s: Record<string, unknown>) => ({
            eventId: saneStr(s.eventId, 60),
            sport: saneStr(s.sport, 60),
            league: saneStr(s.league, 120),
            marketName: saneStr(s.marketName, 60),
            field: saneStr(s.field, 40),
            startTime: saneDate(s.startTime),
            oddValue: saneNumber(s.oddValue),
          })).filter((s) => s.eventId)
        : [];

    // deno-lint-ignore no-explicit-any
    const rows = incoming.map((t: any) => {
      const selections = saneSelections(t.selections);
      const starts = selections.map((s) => s.startTime).filter(Boolean) as string[];
      const firstStart = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
      return {
        account_id: account.id,
        client_ticket_id: saneStr(t.id, 60),
        selections,
        first_start_time: firstStart,
        stake: saneNumber(t.stake),
        combined_odds: saneNumber(t.combinedOdds),
        status: STATUSES.includes(t.status) ? t.status : "pending",
        placed_at: saneDate(t.placedAt) ?? new Date().toISOString(),
        settled_at: saneDate(t.settledAt),
        payout: saneNumber(t.payout),
      };
    }).filter((r) => r.client_ticket_id && r.selections.length);

    if (!rows.length) return jsonResponse({ ok: true, synced: 0 });

    const { error } = await supabase
      .from("tickets")
      .upsert(rows, { onConflict: "account_id,client_ticket_id" });
    if (error) throw error;

    return jsonResponse({ ok: true, synced: rows.length });
  } catch (err) {
    console.error("sync-tickets error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Sync failed." },
      500,
    );
  }
});
