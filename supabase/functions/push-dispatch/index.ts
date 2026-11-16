// push-dispatch — cron (každých 5 min): web push "Sledovaný zápas začíná za N min" pro
// zápasy, které si hráč označil hvězdičkou (tabulka push_watch, plní ji js/push.js jen
// s povolenými upozorněními). Jedno upozornění za zápas a hráče (push_log, kind "match"),
// posílá se, když do začátku zbývá 1–16 min (s 5min cronem tedy ~11–16 min předem).
// Taky uklízí: push_watch po začátku zápasu (+ 1 den), push_log starší 30 dní.
// Výsledky tipů a varování u denního limitu posílá settle-tickets (viz _shared/push.ts).
// Chráněno x-admin-key (nebo JWT admina). POST { dry_run: true } = jen spočítá, nic nepošle.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:support@fundly.games).
//
// Plánování (Supabase dashboard → Database → Cron, nebo SQL):
//   select cron.schedule('push-dispatch-5min', '*/5 * * * *', $$
//     select net.http_post(
//       url := 'https://siruaytogfsgujpwzcsb.supabase.co/functions/v1/push-dispatch',
//       headers := '{"Content-Type":"application/json","x-admin-key":"..."}'::jsonb,
//       body := '{}'::jsonb
//     );
//   $$);
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { isAdminRequest } from "../_shared/admin.ts";
import { claimOnce, pushConfigured, sendToUser } from "../_shared/push.ts";
import { MATCH_LEAD_MAX_MIN, MATCH_LEAD_MIN_MIN, matchDue, matchPayload } from "../_shared/push-texts.ts";

const MAX_PER_RUN = 500;

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!(await isAdminRequest(req))) return jsonResponse({ error: "Unauthorized" }, 401);

  let dryRun = false;
  try { dryRun = !!(await req.json())?.dry_run; } catch { /* prázdné tělo */ }

  if (!pushConfigured()) return jsonResponse({ skipped: true, reason: "VAPID keys not set" });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();

    const { data: due, error } = await supabase
      .from("push_watch")
      .select("user_id, event_id, start_time, label, sport")
      .is("notified_at", null)
      .gte("start_time", iso(now + MATCH_LEAD_MIN_MIN * 60000))
      .lte("start_time", iso(now + MATCH_LEAD_MAX_MIN * 60000))
      .order("start_time", { ascending: true })
      .limit(MAX_PER_RUN);
    if (error) throw error;

    let sent = 0, skipped = 0;
    for (const w of due ?? []) {
      const minutes = matchDue(String(w.start_time), now);
      if (minutes === null) { skipped++; continue; }
      if (dryRun) { sent++; continue; }
      // jednou za zápas a hráče — i když si zápas mezitím odebral a znovu přidal
      if (await claimOnce(supabase, "match", w.user_id, w.event_id)) {
        const r = await sendToUser(supabase, w.user_id, "matches", (lang) => matchPayload(w, minutes, lang));
        sent += r.sent;
      } else {
        skipped++;
      }
      await supabase.from("push_watch").update({ notified_at: iso(now) })
        .eq("user_id", w.user_id).eq("event_id", w.event_id);
    }

    let cleaned = 0;
    if (!dryRun) {
      const { data: oldWatch } = await supabase.from("push_watch").delete()
        .lt("start_time", iso(now - 86400000)).select("event_id");
      const { data: oldLog } = await supabase.from("push_log").delete()
        .lt("created_at", iso(now - 30 * 86400000)).select("ref");
      cleaned = (oldWatch?.length ?? 0) + (oldLog?.length ?? 0);
    }

    return jsonResponse({ ok: true, dry_run: dryRun, due: due?.length ?? 0, sent, skipped, cleaned });
  } catch (err) {
    console.error("push-dispatch error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "push-dispatch failed" }, 500);
  }
});
