// _shared/push-texts.ts — texty a pravidla web push upozornění (čistá logika bez závislostí
// na Deno, testovatelná přes `node --experimental-strip-types`). Odesílání: _shared/push.ts.
//
// Jazyk: cs/sk → česky, cokoli jiného → anglicky (pl zatím anglicky — push je krátký).
// Slovník: "tip/tipy", nikdy "tiket"/"sázka"/"výhra"; "odměna", ne "výplata".
import { DAILY_LOSS_PCT, dailyNet, type LossTicket } from "./loss-limits.ts";

export type PushLang = "cs" | "en";
export type PushKind = "results" | "matches" | "limit";

export interface PushPayload {
  title: string;
  body: string;
  url: string; // relativní k webu (sw.js ho otevře / zaostří)
  tag: string; // stejný tag = nové upozornění nahradí staré (žádné duplicity na zamčené obrazovce)
  kind: PushKind;
}

/** "cs", "sk", "cs-CZ" → "cs"; jinak "en". */
export function pushLang(v: unknown): PushLang {
  const code = typeof v === "string" ? v.trim().slice(0, 2).toLowerCase() : "";
  return code === "cs" || code === "sk" ? "cs" : "en";
}

const money = (n: number, lang: PushLang) =>
  "$" + Math.round(Math.abs(Number(n) || 0)).toLocaleString(lang === "cs" ? "cs-CZ" : "en-US");

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s);

export interface TicketForPush {
  id: string;
  status: "won" | "lost" | "push";
  stake: number | string | null;
  payout: number | string | null;
  selections: { homeTeam?: string | null; awayTeam?: string | null }[];
}

/** "Sparta – Slavia", u AKO tipu "AKO tip · 3 zápasy" / "Combo tip · 3 matches". */
export function ticketLabel(t: TicketForPush, lang: PushLang): string {
  const sels = Array.isArray(t.selections) ? t.selections : [];
  if (sels.length === 1) {
    const s = sels[0] || {};
    const home = String(s.homeTeam ?? "").trim();
    const away = String(s.awayTeam ?? "").trim();
    if (home && away) return clip(`${home} – ${away}`, 90);
    if (home || away) return clip(home || away, 90);
  }
  if (sels.length > 1) {
    const n = sels.length;
    if (lang === "cs") return `AKO tip · ${n} ${n >= 5 ? "zápasů" : "zápasy"}`;
    return `Combo tip · ${n} matches`;
  }
  return lang === "cs" ? "Tvůj tip" : "Your tip";
}

export function resultPayload(t: TicketForPush, lang: PushLang): PushPayload {
  const label = ticketLabel(t, lang);
  const stake = Number(t.stake) || 0;
  const payout = Number(t.payout) || 0;
  const base = { url: "dashboard#vykon", tag: `tip-${t.id}`, kind: "results" as const };
  if (t.status === "won") {
    return {
      ...base,
      title: lang === "cs" ? "Tvůj tip vyšel 🎉" : "Your tip came in 🎉",
      body: lang === "cs"
        ? `${label} · připsáno ${money(payout, lang)} (zisk +${money(payout - stake, lang)})`
        : `${label} · ${money(payout, lang)} credited (+${money(payout - stake, lang)} profit)`,
    };
  }
  if (t.status === "lost") {
    return {
      ...base,
      title: lang === "cs" ? "Tip nevyšel" : "Tip didn't come in",
      body: lang === "cs" ? `${label} · vklad ${money(stake, lang)}` : `${label} · stake ${money(stake, lang)}`,
    };
  }
  return {
    ...base,
    title: lang === "cs" ? "Tip se nepočítá — vklad zpět" : "Tip voided — stake returned",
    body: lang === "cs" ? `${label} · vráceno ${money(stake, lang)}` : `${label} · ${money(stake, lang)} returned`,
  };
}

export function matchPayload(
  w: { event_id: string; label: string },
  minutes: number,
  lang: PushLang,
): PushPayload {
  const m = Math.max(1, Math.round(minutes));
  return {
    title: lang === "cs" ? `Sledovaný zápas začíná za ${m} min` : `Watched match starts in ${m} min`,
    body: lang === "cs"
      ? `${clip(w.label, 120)} · podej tip, dokud je čas.`
      : `${clip(w.label, 120)} · place your tip before kick-off.`,
    url: "dashboard#sazeni",
    tag: `match-${w.event_id}`,
    kind: "matches",
  };
}

export function limitPayload(
  accountId: string,
  day: string,
  remaining: number,
  limit: number,
  lang: PushLang,
): PushPayload {
  return {
    title: lang === "cs" ? "Jsi blízko denního limitu ztráty" : "You're close to your daily loss limit",
    body: lang === "cs"
      ? `Dnes ti zbývá ${money(remaining, lang)} z ${money(limit, lang)}. Po překročení se účet uzavře — zvaž pauzu do zítřka.`
      : `${money(remaining, lang)} of ${money(limit, lang)} left today. Going over closes the account — consider a break until tomorrow.`,
    url: "dashboard#prehled",
    tag: `limit-${accountId}-${day}`,
    kind: "limit",
  };
}

export const LIMIT_WARN_SHARE = 0.25; // varovat, když zbývá ≤ 25 % denního limitu

export interface LimitAccount {
  capital: number | string | null;
  phase: number;
  state: string;
}

/**
 * Denní limit ztráty (4 % kapitálu, UTC den) počítaný stejně jako server při uzavírání
 * účtu (loss-limits.ts dailyNet: nevyřízené vklady se nepočítají). Vrací stav jen tehdy,
 * když je čas varovat: zbývá ≤ 25 % limitu a limit ještě není překročený (to řeší
 * enforceLossLimits — účet se zavře a hráč dostane e-mail).
 */
export function dailyLimitWarning(
  acc: LimitAccount,
  tickets: LossTicket[],
  nowMs: number,
): { limit: number; loss: number; remaining: number; day: string } | null {
  if (!["active", "pending_approval", "funded"].includes(acc.state)) return null;
  const cap = Number(acc.capital);
  if (!Number.isFinite(cap) || cap <= 0) return null;
  const limit = cap * DAILY_LOSS_PCT;
  const loss = Math.max(0, -dailyNet(tickets, nowMs));
  const remaining = limit - loss;
  if (loss <= 0 || remaining <= 0 || remaining > limit * LIMIT_WARN_SHARE) return null;
  return { limit, loss, remaining, day: new Date(nowMs).toISOString().slice(0, 10) };
}

/** Minuty do začátku; push-dispatch posílá, když je to 1–16 min (cron každých 5 min). */
export const MATCH_LEAD_MAX_MIN = 16;
export const MATCH_LEAD_MIN_MIN = 1;
export function matchDue(startIso: string, nowMs: number): number | null {
  const t = Date.parse(startIso);
  if (!Number.isFinite(t)) return null;
  const min = (t - nowMs) / 60000;
  return min >= MATCH_LEAD_MIN_MIN && min <= MATCH_LEAD_MAX_MIN ? min : null;
}
