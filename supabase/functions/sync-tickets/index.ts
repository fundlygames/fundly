// sync-tickets — posílá jednotlivé tikety (ne jen souhrn jako sync-account),
// podklad pro cross-account risk detekci (MULTI_ACCOUNT_COLLUSION, BOT_PATTERN,
// TIMING_ANOMALY, LOW_VARIANCE). POST { tickets: [...] } + Authorization: Bearer.
// Klient posílá jen tikety od posledního syncu (viz js/dashboard.js) — upsert
// přes unique (account_id, client_ticket_id) dovoluje bezpečný re-send.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { verifyTicketOutcome, type VerifySelection } from "../_shared/settle-verify.ts";

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
            homeTeam: saneStr(s.homeTeam, 80),
            awayTeam: saneStr(s.awayTeam, 80),
            marketName: saneStr(s.marketName, 60),
            field: saneStr(s.field, 40),
            hdp: s.hdp == null ? null : saneNumber(s.hdp),
            startTime: saneDate(s.startTime),
            oddValue: saneNumber(s.oddValue),
            pickLabel: saneStr(s.pickLabel, 80),
          })).filter((s) => s.eventId)
        : [];

    // deno-lint-ignore no-explicit-any
    const draftRows = incoming.map((t: any) => {
      const selections = saneSelections(t.selections);
      const starts = selections.map((s) => s.startTime).filter(Boolean) as string[];
      const firstStart = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null;
      return {
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

    if (!draftRows.length) return jsonResponse({ ok: true, synced: 0, settled: [] });

    // Nikdy nepřepsat už vyřízený tiket zpátky na pending — settle-tickets
    // (cron) ho mohl vyhodnotit dřív, než klient stihl re-syncnout svou
    // ještě-pending verzi. Existující nepending stav vždy vyhrává.
    const ids = draftRows.map((r) => r.client_ticket_id) as string[];
    const { data: existingRows } = await supabase
      .from("tickets")
      .select("client_ticket_id, status, payout, settled_at")
      .eq("account_id", account.id)
      .in("client_ticket_id", ids);
    const existingByTicket = new Map((existingRows ?? []).map((r) => [r.client_ticket_id, r]));

    // Klientovo tvrzení "won"/"lost"/"push" pro tiket, co server ještě jako
    // vyřízený nezná, se NESMÍ jen tak uložit — bez nezávislého ověření proti
    // odds-api šlo poslat libovolný vymyšlený výsledek/výplatu a server to
    // uložil bez kontroly. Reálně takhle vznikl rozdíl mezi tím, co dokládají
    // tikety, a uloženým zůstatkem účtu (nalezeno 22.9., viz sync-account).
    // "cashedout" navíc kontrolujeme na čas: předčasný výběr (90 % vkladu)
    // dává smysl JEN před začátkem zápasu — jinak jde o "počkám, jak to
    // dopadne, a pak si vezmu 90 % zpátky", což je zaručený zisk na úkor
    // skutečného rizika.
    const apiKey = Deno.env.get("ODDS_API_KEY");
    const settledForClient: { id: string; status: string; payout: number | null; settledAt: string | null }[] = [];
    const rows = await Promise.all(draftRows.map(async (r) => {
      const existing = existingByTicket.get(r.client_ticket_id!);
      if (existing && existing.status !== "pending") {
        if (r.status === "pending") {
          // server (nebo dřívější sync) tenhle tiket už vyřídil, klient o tom ještě neví
          settledForClient.push({ id: r.client_ticket_id!, status: existing.status, payout: existing.payout, settledAt: existing.settled_at });
        }
        return { ...r, account_id: account.id, status: existing.status, payout: existing.payout, settled_at: existing.settled_at };
      }

      if (r.status === "cashedout") {
        const now = Date.now();
        const anyStarted = r.selections.some((s) => s.startTime && new Date(s.startTime).getTime() <= now);
        if (anyStarted) {
          console.error(`sync-tickets REJECTED_LATE_CASHOUT: account ${account.id} ticket ${r.client_ticket_id} — cashout claimed after a selection's start time`);
          return { ...r, account_id: account.id, status: "pending", payout: null, settled_at: null };
        }
        return { ...r, account_id: account.id };
      }

      if (r.status !== "pending") {
        if (!apiKey) {
          return { ...r, account_id: account.id, status: "pending", payout: null, settled_at: null };
        }
        const verified = await verifyTicketOutcome(r.selections as VerifySelection[], r.placed_at, apiKey);
        if (!verified) {
          // podle reálných dat ještě není rozhodnuto — klientovo tvrzení se ignoruje
          return { ...r, account_id: account.id, status: "pending", payout: null, settled_at: null };
        }
        const stake = r.stake ?? 0;
        const verifiedPayout = verified.status === "lost" ? 0 : Math.round(stake * verified.payoutFactor);
        if (verified.status !== r.status || verifiedPayout !== r.payout) {
          console.error(`sync-tickets INTEGRITY_MISMATCH: account ${account.id} ticket ${r.client_ticket_id} claimed ${r.status}/$${r.payout}, real result is ${verified.status}/$${verifiedPayout}`);
        }
        return { ...r, account_id: account.id, status: verified.status, payout: verifiedPayout, settled_at: r.settled_at ?? new Date().toISOString() };
      }

      return { ...r, account_id: account.id };
    }));

    const { error } = await supabase
      .from("tickets")
      .upsert(rows, { onConflict: "account_id,client_ticket_id" });
    if (error) throw error;

    return jsonResponse({ ok: true, synced: rows.length, settled: settledForClient });
  } catch (err) {
    console.error("sync-tickets error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Sync failed." },
      500,
    );
  }
});
