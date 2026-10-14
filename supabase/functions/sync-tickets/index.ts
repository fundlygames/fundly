// sync-tickets — posílá jednotlivé tikety (ne jen souhrn jako sync-account),
// podklad pro cross-account risk detekci (MULTI_ACCOUNT_COLLUSION, BOT_PATTERN,
// TIMING_ANOMALY, LOW_VARIANCE). POST { tickets: [...] } + Authorization: Bearer.
// Klient posílá jen tikety od posledního syncu (viz js/dashboard.js) — upsert
// přes unique (account_id, client_ticket_id) dovoluje bezpečný re-send.
//
// Klient je nedůvěryhodný, proto:
//  • NOVÝ tiket (server ho ještě nezná) projde kontrolou _shared/ticket-admission.ts —
//    max. stávka, rozsah kurzů, limit zisku, jedna sázka na zápas a hlavně živá data
//    odds-api (zápas už skončil / kurzy se mezitím změnily / trh stažen). Neprošlý
//    tiket se stornuje (status push = vrácený vklad), poctivý hráč o nic nepřijde.
//    TICKET_ADMISSION_ENFORCE=false = jen zapisovat do admission_note, nestornovat.
//  • EXISTUJÍCÍ tiket je nezměnitelný: stávka, kurzy, zápasy a čas podání zůstávají
//    z prvního doručení (jinak by si hráč po výsledku "dopsal" vyšší stávku/kurz).
//  • cash-out = vždy 90 % vkladu a jen před začátkem zápasu podle ULOŽENÝCH časů.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { verifyTicketOutcome, type VerifySelection } from "../_shared/settle-verify.ts";
import { staticAdmission, fetchEventInfo, evaluateSelection, type DraftSelection } from "../_shared/ticket-admission.ts";
import { enforceLossLimits } from "../_shared/loss-enforce.ts";

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
      .select("id, capital, phase, state")
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
      .select("client_ticket_id, status, payout, settled_at, selections, stake, combined_odds, placed_at, first_start_time, admission_note")
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
    const bookmakers = (Deno.env.get("ODDS_API_BOOKMAKER") ?? "Bet365,Sportsbet.com.au").split(",").map((b) => b.trim());
    const enforce = Deno.env.get("TICKET_ADMISSION_ENFORCE") !== "false";
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const settledForClient: { id: string; status: string; payout: number | null; settledAt: string | null; voidReason?: string }[] = [];

    // ---------- kontrola NOVÝCH tiketů ----------
    const newDrafts = draftRows
      .filter((r) => !existingByTicket.has(r.client_ticket_id!))
      .sort((x, y) => x.placed_at.localeCompare(y.placed_at));
    const admission = new Map<string, { reason: string | null; combinedOdds: number; selections: typeof draftRows[number]["selections"]; placedAt: string }>();
    if (newDrafts.length) {
      // zápasy, na které už má hráč otevřený tiket (jedna sázka na zápas)
      const { data: pendingRows } = await supabase
        .from("tickets").select("selections").eq("account_id", account.id).eq("status", "pending");
      const pendingEventIds = new Set<string>();
      for (const t of pendingRows ?? []) for (const s of (t.selections ?? []) as { eventId?: string }[]) if (s.eventId) pendingEventIds.add(String(s.eventId));

      const infoMap = apiKey
        ? await fetchEventInfo(newDrafts.flatMap((r) => r.selections.map((s) => String(s.eventId))), apiKey, bookmakers)
        : new Map();

      for (const r of newDrafts) {
        const sels = r.selections as DraftSelection[];
        let reason: string | null = null;
        const st = staticAdmission({ stake: r.stake, selections: sels }, account, pendingEventIds);
        reason = st.reason;
        if (!reason) {
          for (const s of sels) {
            reason = evaluateSelection(s, infoMap.get(String(s.eventId)), bookmakers, nowMs);
            if (reason) break;
          }
        }
        // čas začátku zápasu bere server od odds-api, ne od klienta (rozhoduje o cash-outu i o "live")
        const verifiedSelections = r.selections.map((s) => {
          const info = infoMap.get(String(s.eventId));
          return info?.date ? { ...s, startTime: new Date(info.date).toISOString() } : s;
        });
        // čas podání: klientovu hodnotu jen přibližně potvrdit (posun hodin), jinak je to čas doručení
        const claimed = new Date(r.placed_at).getTime();
        const placedAt = (claimed >= nowMs - 120_000 && claimed <= nowMs + 5_000) ? r.placed_at : nowIso;
        admission.set(r.client_ticket_id!, { reason, combinedOdds: st.combinedOdds, selections: verifiedSelections, placedAt });
        if (!reason) for (const s of sels) pendingEventIds.add(String(s.eventId));
      }
    }

    // Klientovo tvrzení "won"/"lost"/"push" pro tiket, co server ještě jako
    // vyřízený nezná, se NESMÍ jen tak uložit — bez nezávislého ověření proti
    // odds-api šlo poslat libovolný vymyšlený výsledek/výplatu a server to
    // uložil bez kontroly. Reálně takhle vznikl rozdíl mezi tím, co dokládají
    // tikety, a uloženým zůstatkem účtu (nalezeno 22.9., viz sync-account).
    const rows = await Promise.all(draftRows.map(async (r) => {
      const existing = existingByTicket.get(r.client_ticket_id!);

      // ---- tiket server už zná ----
      if (existing) {
        // Nezměnitelná pole z PRVNÍHO doručení — klient je nesmí přepsat.
        const frozen = {
          selections: existing.selections, stake: existing.stake, combined_odds: existing.combined_odds,
          placed_at: existing.placed_at, first_start_time: existing.first_start_time, admission_note: existing.admission_note,
        };
        if (existing.status !== "pending") {
          const voided = typeof existing.admission_note === "string" && existing.admission_note.startsWith("voided:");
          // klient o vyřízení neví (posílá pending), nebo se o stornu ještě nedozvěděl
          if (r.status === "pending" || (voided && r.status !== existing.status)) {
            settledForClient.push({
              id: r.client_ticket_id!, status: existing.status, payout: existing.payout, settledAt: existing.settled_at,
              ...(voided ? { voidReason: String(existing.admission_note).slice(7).trim() } : {}),
            });
          }
          return { ...r, ...frozen, account_id: account.id, status: existing.status, payout: existing.payout, settled_at: existing.settled_at };
        }
        const base = { ...r, ...frozen, account_id: account.id };
        const stored = existing.selections as VerifySelection[];

        if (r.status === "cashedout") {
          const anyStarted = stored.some((s) => s.startTime && new Date(s.startTime).getTime() <= nowMs);
          if (anyStarted) {
            console.error(`sync-tickets REJECTED_LATE_CASHOUT: account ${account.id} ticket ${r.client_ticket_id} — cashout claimed after a selection's start time`);
            return { ...base, status: "pending", payout: null, settled_at: null };
          }
          // výše cash-outu je vždy 90 % VKLADU podle serveru, ne částka z klienta
          return { ...base, status: "cashedout", payout: Math.round(Number(existing.stake) * 0.9), settled_at: r.settled_at ?? nowIso };
        }
        if (r.status !== "pending") {
          if (!apiKey) return { ...base, status: "pending", payout: null, settled_at: null };
          const verified = await verifyTicketOutcome(stored, existing.placed_at, apiKey);
          if (!verified) return { ...base, status: "pending", payout: null, settled_at: null };
          const stake = Number(existing.stake) || 0;
          const verifiedPayout = verified.status === "lost" ? 0 : Math.round(stake * verified.payoutFactor);
          if (verified.status !== r.status || verifiedPayout !== r.payout) {
            console.error(`sync-tickets INTEGRITY_MISMATCH: account ${account.id} ticket ${r.client_ticket_id} claimed ${r.status}/$${r.payout}, real result is ${verified.status}/$${verifiedPayout}`);
          }
          return { ...base, status: verified.status, payout: verifiedPayout, settled_at: r.settled_at ?? nowIso };
        }
        return { ...base, status: "pending", payout: null, settled_at: null };
      }

      // ---- nový tiket ----
      const adm = admission.get(r.client_ticket_id!)!;
      const common = { ...r, account_id: account.id, selections: adm.selections, combined_odds: adm.combinedOdds, placed_at: adm.placedAt };
      if (adm.reason) {
        console.error(`sync-tickets ${enforce ? "VOIDED" : "WOULD_VOID"}: account ${account.id} ticket ${r.client_ticket_id} — ${adm.reason}`);
        if (!enforce) return { ...common, admission_note: `would void: ${adm.reason}` };
        settledForClient.push({ id: r.client_ticket_id!, status: "push", payout: r.stake, settledAt: nowIso, voidReason: adm.reason });
        return { ...common, status: "push", payout: r.stake, settled_at: nowIso, admission_note: `voided: ${adm.reason}` };
      }
      // nový tiket nemůže být rovnou vyplacený cash-out ani vyhodnocený "naslepo"
      if (r.status === "cashedout") return { ...common, status: "pending", payout: null, settled_at: null };
      if (r.status !== "pending") {
        if (!apiKey) return { ...common, status: "pending", payout: null, settled_at: null };
        const verified = await verifyTicketOutcome(adm.selections as VerifySelection[], adm.placedAt, apiKey);
        if (!verified) return { ...common, status: "pending", payout: null, settled_at: null };
        const stake = r.stake ?? 0;
        const verifiedPayout = verified.status === "lost" ? 0 : Math.round(stake * verified.payoutFactor);
        return { ...common, status: verified.status, payout: verifiedPayout, settled_at: r.settled_at ?? nowIso };
      }
      return common;
    }));

    const { error } = await supabase
      .from("tickets")
      .upsert(rows, { onConflict: "account_id,client_ticket_id" });
    if (error) throw error;

    // limity ztráty se počítají na serveru z tiketů — klient je nemůže "nenahlásit"
    const closedReason = await enforceLossLimits(supabase, account.id).catch((e) => { console.error("enforceLossLimits:", e); return null; });

    return jsonResponse({ ok: true, synced: rows.length, settled: settledForClient, ...(closedReason ? { closed: closedReason } : {}) });
  } catch (err) {
    console.error("sync-tickets error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Sync failed." },
      500,
    );
  }
});
