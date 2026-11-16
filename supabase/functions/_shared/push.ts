// _shared/push.ts — odesílání web push upozornění (tabulky z migrace 044_push.sql).
//
// Secrets: VAPID_PUBLIC_KEY (stejný jako FUNDLY_VAPID_PUBLIC_KEY v js/config.js),
// VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:support@fundly.games). Bez nich je všechno
// no-op ({ skipped: true }) — settle-tickets tak běží dál i bez nastaveného push.
//
// sendToUser() respektuje prefs zařízení (results / matches / limit), mluví jazykem
// zařízení (sloupec lang, jinak userLang()), 404/410 od push služby = odběr zanikl → řádek
// smaže. Nikdy nehází výjimku — upozornění jsou bonus, nesmí shodit vyhodnocení tipů.
import webpush from "npm:web-push@3.6.7";
import { userLang } from "./user-lang.ts";
import {
  dailyLimitWarning, limitPayload, pushLang, resultPayload,
  type LimitAccount, type PushKind, type PushLang, type PushPayload, type TicketForPush,
} from "./push-texts.ts";
import type { LossTicket } from "./loss-limits.ts";

export type { PushKind, PushPayload } from "./push-texts.ts";

const MAX_FAILS = 20; // tolik selhání po sobě (5xx, timeout) → odběr je mrtvý, smazat

// jak dlouho má push služba zprávu držet, když je telefon offline (s)
const TTL: Record<PushKind, number> = { results: 6 * 3600, matches: 15 * 60, limit: 6 * 3600 };

let configured: boolean | null = null;
export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const priv = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@fundly.games";
  if (!pub || !priv) return (configured = false);
  try {
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
  } catch (e) {
    console.error("push: neplatné VAPID klíče:", e instanceof Error ? e.message : e);
    configured = false;
  }
  return configured;
}

type SubRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  prefs: Record<string, unknown> | null;
  lang: string | null;
  fail_count: number | null;
};

const wants = (s: SubRow, kind: PushKind) => !s.prefs || s.prefs[kind] !== false;

/** Uživatelé (z dodaného seznamu), kteří mají aspoň jedno zařízení s odběrem — jeden dotaz. */
// deno-lint-ignore no-explicit-any
export async function usersWithPush(supabase: any, userIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length || !pushConfigured()) return out;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("push_subscriptions").select("user_id").in("user_id", ids.slice(i, i + 200));
    if (error) { console.error("push: usersWithPush:", error.message); continue; }
    for (const r of data ?? []) out.add(String(r.user_id));
  }
  return out;
}

/**
 * Jednorázová značka "už posláno" (push_log). true = tahle instance si ji zabrala a má
 * poslat; false = už bylo posláno (nebo chyba — raději nic než duplicita).
 */
// deno-lint-ignore no-explicit-any
export async function claimOnce(supabase: any, kind: "result" | "match" | "limit", userId: string, ref: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("push_log")
    .upsert({ kind, user_id: userId, ref }, { onConflict: "kind,user_id,ref", ignoreDuplicates: true })
    .select("ref");
  if (error) { console.error("push: claimOnce:", error.message); return false; }
  return Array.isArray(data) && data.length > 0;
}

export type SendResult = { skipped?: boolean; sent: number; failed: number; removed: number };

/**
 * Pošle upozornění na všechna zařízení hráče, která daný typ nemají vypnutý.
 * payload: hotový objekt, nebo funkce jazyka (cs/en) → objekt.
 */
export async function sendToUser(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  kind: PushKind,
  payload: PushPayload | ((lang: PushLang) => PushPayload),
): Promise<SendResult> {
  const res: SendResult = { sent: 0, failed: 0, removed: 0 };
  if (!userId || !pushConfigured()) return { ...res, skipped: true };
  try {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth, prefs, lang, fail_count")
      .eq("user_id", userId);
    if (error) throw error;
    const subs = ((data ?? []) as SubRow[]).filter((s) => wants(s, kind));
    if (!subs.length) return res;

    let accountLang: PushLang | null = null;
    const langOf = async (s: SubRow): Promise<PushLang> => {
      if (s.lang) return pushLang(s.lang);
      if (!accountLang) accountLang = pushLang(await userLang(supabase, { userId }));
      return accountLang;
    };

    for (const s of subs) {
      const lang = await langOf(s);
      const p = typeof payload === "function" ? payload(lang) : payload;
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(p),
          { TTL: TTL[kind], urgency: kind === "results" ? "normal" : "high", topic: topicOf(p.tag) },
        );
        res.sent++;
        await supabase.from("push_subscriptions")
          .update({ last_ok_at: new Date().toISOString(), fail_count: 0 }).eq("id", s.id);
      } catch (e) {
        // deno-lint-ignore no-explicit-any
        const code = Number((e as any)?.statusCode) || 0;
        if (code === 404 || code === 410) {
          res.removed++;
          await supabase.from("push_subscriptions").delete().eq("id", s.id);
          continue;
        }
        res.failed++;
        const fails = (Number(s.fail_count) || 0) + 1;
        console.error(`push: send selhal (${code || "?"}) sub ${s.id}:`, e instanceof Error ? e.message : e);
        if (fails >= MAX_FAILS) {
          res.removed++;
          await supabase.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          await supabase.from("push_subscriptions").update({ fail_count: fails }).eq("id", s.id);
        }
      }
    }
  } catch (e) {
    console.error("push: sendToUser:", e instanceof Error ? e.message : e);
  }
  return res;
}

// Topic hlavička (max. 32 znaků base64url): stejné téma = push služba drží jen poslední zprávu
function topicOf(tag: string): string {
  return tag.replace(/[^A-Za-z0-9_-]/g, "").slice(-32) || "fundly";
}

// ---------- napojení na settle-tickets ----------

export type SettledForPush = TicketForPush & { account_id: string | null };

/**
 * Upozornění na tipy, které právě vyhodnotil SERVER (klient je u otevřeného dashboardu
 * vyhodnotí sám dřív — pak řádek už není pending a sem se nedostane). Jeden dotaz na účty,
 * jeden na odběry; hráči bez odběru se přeskočí bez dalších dotazů.
 */
// deno-lint-ignore no-explicit-any
export async function notifySettledTickets(supabase: any, tickets: SettledForPush[]): Promise<number> {
  if (!tickets.length || !pushConfigured()) return 0;
  const accountIds = [...new Set(tickets.map((t) => t.account_id).filter(Boolean) as string[])];
  const owner = new Map<string, string>();
  for (let i = 0; i < accountIds.length; i += 200) {
    const { data } = await supabase.from("challenge_accounts").select("id, user_id").in("id", accountIds.slice(i, i + 200));
    for (const a of data ?? []) if (a.user_id) owner.set(String(a.id), String(a.user_id));
  }
  const withPush = await usersWithPush(supabase, [...owner.values()]);
  let sent = 0;
  for (const t of tickets) {
    const userId = t.account_id ? owner.get(t.account_id) : undefined;
    if (!userId || !withPush.has(userId)) continue;
    if (!(await claimOnce(supabase, "result", userId, t.id))) continue;
    const r = await sendToUser(supabase, userId, "results", (lang) => resultPayload(t, lang));
    sent += r.sent;
  }
  return sent;
}

/**
 * Po serverovém vyhodnocení prohraného tipu: zbývá-li dnes ≤ 25 % denního limitu ztráty,
 * jedno upozornění za účet a UTC den. Volat až PO enforceLossLimits (překročený limit =
 * účet zavřený, žádné varování).
 */
// deno-lint-ignore no-explicit-any
export async function notifyDailyLimit(supabase: any, accountId: string): Promise<boolean> {
  if (!pushConfigured()) return false;
  const { data: acc } = await supabase
    .from("challenge_accounts").select("id, user_id, capital, phase, state").eq("id", accountId).maybeSingle();
  if (!acc?.user_id) return false;
  const userId = String(acc.user_id);
  if (!(await usersWithPush(supabase, [userId])).has(userId)) return false;
  // dailyNet počítá jen dnešní UTC den (vklad v den zadání, výplata v den vyřízení) —
  // tipy zadané před víc než pár dny se dnes projeví jen výplatou, stačí rozumné okno
  const { data: tix } = await supabase
    .from("tickets").select("stake, payout, status, placed_at, settled_at").eq("account_id", accountId)
    .gte("placed_at", new Date(Date.now() - 45 * 86400000).toISOString());
  const now = Date.now();
  const w = dailyLimitWarning(acc as LimitAccount, (tix ?? []) as LossTicket[], now);
  if (!w) return false;
  if (!(await claimOnce(supabase, "limit", userId, `${accountId}:${w.day}`))) return false;
  const r = await sendToUser(supabase, userId, "limit", (lang) => limitPayload(accountId, w.day, w.remaining, w.limit, lang));
  return r.sent > 0;
}
