// _shared/user-lang.ts — v jakém jazyce poslat hráči e-mail.
// Pořadí: 1) explicitní hint (např. lang z těla requestu),
//         2) auth user_metadata.lang (web ho ukládá při každém přihlášení, viz js/whop.js),
//            pak user_metadata.checkout_lang (jazyk v checkoutu při registraci),
//         3) doména e-mailu: .cz/.sk → cs, .pl → pl,
//         4) en.
// Normalizace: cs/sk → "cs", pl → "pl", cokoli jiného → "en". Nikdy nehází výjimku —
// při chybě vyhledání se vrátí výsledek podle domény / výchozí.
// Čisté funkce (normalizeLang, langFromMeta, langFromEmail, resolveLangSync) nemají
// závislosti, ať jdou použít i tam, kde už uživatele máme načtené (email-followups).

export type UserLang = "en" | "cs" | "pl";

// deno-lint-ignore no-explicit-any
type AuthUserLike = { id?: string; email?: string | null; user_metadata?: Record<string, any> | null } | null | undefined;

/** "cs", "sk", "cs-CZ" → "cs"; "pl" → "pl"; jiný neprázdný kód → "en"; prázdné → null. */
export function normalizeLang(v: unknown): UserLang | null {
  if (typeof v !== "string") return null;
  const code = v.trim().slice(0, 2).toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return null;
  if (code === "cs" || code === "sk") return "cs";
  if (code === "pl") return "pl";
  return "en";
}

// deno-lint-ignore no-explicit-any
export function langFromMeta(meta: Record<string, any> | null | undefined): UserLang | null {
  if (!meta || typeof meta !== "object") return null;
  return normalizeLang(meta.lang) ?? normalizeLang(meta.checkout_lang);
}

export function langFromEmail(email: string | null | undefined): UserLang {
  const e = String(email ?? "").trim().toLowerCase();
  if (e.endsWith(".cz") || e.endsWith(".sk")) return "cs";
  if (e.endsWith(".pl")) return "pl";
  return "en";
}

/** Synchronní varianta pro případy, kdy už auth uživatele (nebo jeho metadata) máme. */
export function resolveLangSync(opts: { hint?: string | null; user?: AuthUserLike; email?: string | null }): UserLang {
  try {
    return normalizeLang(opts.hint) ??
      langFromMeta(opts.user?.user_metadata) ??
      langFromEmail(opts.email ?? opts.user?.email);
  } catch {
    return "en";
  }
}

// Krátká paměť v rámci jedné instance funkce (hledání podle userId): cron, který posílá
// víc e-mailů, nemusí stejného uživatele hledat opakovaně.
const CACHE_MS = 5 * 60 * 1000;
// deno-lint-ignore no-explicit-any
const cache = new Map<string, { at: number; meta: Record<string, any> | null }>();
// deno-lint-ignore no-explicit-any
function cached(key: string): Record<string, any> | null | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_MS) { cache.delete(key); return undefined; }
  return hit.meta;
}
// deno-lint-ignore no-explicit-any
function remember(key: string, meta: Record<string, any> | null) {
  if (cache.size > 5000) cache.clear();
  cache.set(key, { at: Date.now(), meta });
}

// Hledání podle e-mailu: stejný vzor jako whop-webhook findExistingUser (listUsers je
// stránkované po 1000), jen se z výsledku postaví index e-mail → metadata, který sdílí
// všechna hledání v instanci (i souběžná — např. waitlist invite_batch přes Promise.all),
// takže dávka e-mailů stojí jen pár volání admin API. Strop stránek je nízký — jde
// o jazyk e-mailu, ne o nic kritického. Při nenalezení v indexu starším než 30 s se
// index jednou přestaví (uživatel mohl vzniknout před chvílí, např. checkout signup).
const MAX_PAGES = 10;
const STALE_MISS_MS = 30 * 1000;
// deno-lint-ignore no-explicit-any
let emailIndex: { at: number; map: Promise<Map<string, Record<string, any>>> } | null = null;

// deno-lint-ignore no-explicit-any
async function buildEmailIndex(supabase: any): Promise<Map<string, Record<string, any>>> {
  // deno-lint-ignore no-explicit-any
  const map = new Map<string, Record<string, any>>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const u of users) {
      if (u?.email) map.set(String(u.email).toLowerCase(), u.user_metadata ?? {});
    }
    if (users.length < 1000) break;
  }
  return map;
}

// deno-lint-ignore no-explicit-any
function emailIndexFor(supabase: any, rebuildIfOlderThan = 0) {
  const now = Date.now();
  // rebuildIfOlderThan: přestavět jen pokud je index pořád ten starý — souběžná hledání
  // tak nespustí několik přestaveb najednou
  if (!emailIndex || now - emailIndex.at > CACHE_MS || emailIndex.at < rebuildIfOlderThan) {
    const entry = { at: now, map: buildEmailIndex(supabase) };
    emailIndex = entry;
    // selhání nezapamatovat — příští hledání to zkusí znovu
    entry.map.catch(() => { if (emailIndex === entry) emailIndex = null; });
  }
  return emailIndex;
}

// deno-lint-ignore no-explicit-any
async function metaByEmail(supabase: any, email: string): Promise<Record<string, any> | null> {
  const target = email.trim().toLowerCase();
  let idx = emailIndexFor(supabase);
  let hit = (await idx.map).get(target);
  if (!hit && Date.now() - idx.at > STALE_MISS_MS) {
    idx = emailIndexFor(supabase, idx.at + 1);
    hit = (await idx.map).get(target);
  }
  return hit ?? null;
}

// deno-lint-ignore no-explicit-any
async function metaById(supabase: any, userId: string): Promise<Record<string, any> | null> {
  const key = `u:${userId}`;
  const c = cached(key);
  if (c !== undefined) return c;
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) return null;
  const meta = data?.user?.user_metadata ?? null;
  remember(key, meta ?? {});
  return meta;
}

/**
 * Jazyk e-mailu pro hráče. `user` = už načtený auth uživatel (pak se nic nedohledává),
 * jinak se metadata dohledají podle userId, případně podle e-mailu (admin API).
 */
export async function userLang(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  opts: { userId?: string | null; email?: string | null; hint?: string | null; user?: AuthUserLike },
): Promise<UserLang> {
  const email = opts.email ?? opts.user?.email ?? null;
  const fallback = langFromEmail(email);
  try {
    const fromHint = normalizeLang(opts.hint);
    if (fromHint) return fromHint;
    if (opts.user?.user_metadata) {
      const l = langFromMeta(opts.user.user_metadata);
      if (l) return l;
    }
    if (supabase) {
      if (opts.userId) {
        const l = langFromMeta(await metaById(supabase, opts.userId));
        if (l) return l;
      } else if (email && !opts.user?.user_metadata) {
        const l = langFromMeta(await metaByEmail(supabase, email));
        if (l) return l;
      }
    }
  } catch (e) {
    console.error("userLang lookup selhal:", e instanceof Error ? e.message : e);
  }
  return fallback;
}
