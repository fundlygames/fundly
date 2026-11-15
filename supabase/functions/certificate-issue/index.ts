// certificate-issue — vydá (nebo vrátí už vydaný) certifikát "Fundly Certified
// Analyst" po splnění OBOU hodnoticích fází (challenge_accounts.phase2_completed_at).
// Aktivační poplatek ani funded stav se nevyžadují.
// POST { accountId, displayName? } + Authorization: Bearer <user access token>
//
// • účet musí patřit přihlášenému hráči a mít vyplněné phase2_completed_at
// • jméno na certifikátu = přezdívka z profilu (challenge_accounts.nickname);
//   když chybí, hráč ho zadá jednou (displayName) a uloží se do certifikátu.
//   E-mail se nikdy netiskne (jméno s "@" se odmítne).
// • statistiky se počítají tady na serveru z tabulky tickets (Fáze 1 + Fáze 2
//   dohromady + rozpad po fázích) — klient je nedodává
// • idempotentní: jeden certifikát na účet (unique account_id + kind)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { packageByKey } from "../_shared/packages.ts";

const KIND = "phase2";
const SITE_URL = "https://fundly.games";
const PUBLIC_COLUMNS = "id, kind, display_name, package_key, capital, passed_at, issued_at, stats, revoked";

// stejný základní filtr jako profile-update (přezdívka) — jméno je veřejné
const NAME_BLOCKLIST = [
  "kokot", "kurva", "kurwa", "pica", "pička", "curak", "čurák", "zmrd", "debil",
  "buzerant", "pico", "chuj", "huj",
  "fuck", "shit", "cunt", "nigger", "nigga", "faggot", "bitch", "whore", "rape",
  "hitler", "nazi", "puta", "mierda", "polla",
];
function normalizeForFilter(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// vrátí očištěné jméno, nebo null když je neplatné
function cleanName(raw: unknown): string | null {
  const name = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim();
  if (name.length < 2) return null;
  if (name.includes("@")) return null; // nikdy netisknout e-mail
  if (/https?:|www\./i.test(name)) return null;
  const norm = normalizeForFilter(name);
  if (NAME_BLOCKLIST.some((w) => norm.includes(w))) return null;
  return name;
}

// krátké náhodné ID: FC-7K3M9Q (bez 0/O/1/I/L, ať se dá přepsat z obrázku)
const ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function newCertificateId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ID_ALPHABET[b % ID_ALPHABET.length];
  return `FC-${s}`;
}

interface TicketRow {
  stake: number | null;
  combined_odds: number | null;
  status: string;
  placed_at: string;
  payout: number | null;
}

interface PhaseStats {
  tips: number;
  won: number;
  lost: number;
  winRate: number | null; // % z rozhodnutých tipů (výhra/prohra, bez vrácených)
  profitPct: number; // čistý výsledek v % kapitálu
  avgOdds: number | null;
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

function computeStats(tickets: TicketRow[], capital: number): PhaseStats {
  let won = 0, lost = 0, net = 0, oddsSum = 0, oddsN = 0;
  for (const t of tickets) {
    const stake = Number(t.stake) || 0;
    const payout = Number(t.payout) || 0;
    if (t.status === "won") won++;
    else if (t.status === "lost") lost++;
    else if (t.status === "cashedout") (payout >= stake ? won++ : lost++);
    net += t.status === "lost" ? -stake : payout - stake;
    const odds = Number(t.combined_odds);
    if (Number.isFinite(odds) && odds > 1) { oddsSum += odds; oddsN++; }
  }
  const decided = won + lost;
  return {
    tips: tickets.length,
    won,
    lost,
    winRate: decided ? round((won / decided) * 100, 1) : null,
    profitPct: capital > 0 ? round((net / capital) * 100, 2) : 0,
    avgOdds: oddsN ? round(oddsSum / oddsN, 2) : null,
  };
}

function publicCert(row: Record<string, unknown>) {
  return { ...row, verifyUrl: `${SITE_URL}/certificate?id=${row.id}` };
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

    const body = await req.json().catch(() => ({}));
    const accountId = String(body.accountId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(accountId)) {
      return jsonResponse({ error: "Missing account.", code: "bad_request" }, 400);
    }

    const { data: account } = await supabase
      .from("challenge_accounts")
      .select("id, user_id, package_key, capital, nickname, created_at, phase1_completed_at, phase2_completed_at")
      .eq("id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!account) return jsonResponse({ error: "Account not found.", code: "not_found" }, 404);

    // idempotence: už vydaný certifikát se jen vrátí (i když se mezitím změnila přezdívka)
    const { data: existing } = await supabase
      .from("certificates")
      .select(PUBLIC_COLUMNS)
      .eq("account_id", account.id)
      .eq("kind", KIND)
      .maybeSingle();
    if (existing) {
      if (existing.revoked) return jsonResponse({ error: "This certificate was revoked.", code: "revoked" }, 410);
      return jsonResponse({ ok: true, certificate: publicCert(existing) });
    }

    if (!account.phase2_completed_at) {
      return jsonResponse({ error: "Both evaluation phases must be passed first.", code: "not_eligible" }, 400);
    }

    const nickname = cleanName(account.nickname);
    const displayName = nickname ?? cleanName(body.displayName);
    if (!displayName) {
      return jsonResponse({
        error: body.displayName ? "That name isn't allowed — please enter another." : "Please enter the name to print on the certificate.",
        code: body.displayName ? "name_invalid" : "name_required",
      }, 400);
    }

    const pkg = packageByKey(String(account.package_key ?? ""));
    const capital = Number(account.capital) || pkg?.cap || 0;
    const phase1End = account.phase1_completed_at ? new Date(account.phase1_completed_at).getTime() : null;
    const phase2End = account.phase2_completed_at;

    // všechny vyhodnocené tipy obou fází (podáno před splněním Fáze 2), po stránkách
    const tickets: TicketRow[] = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await supabase
        .from("tickets")
        .select("stake, combined_odds, status, placed_at, payout")
        .eq("account_id", account.id)
        .lt("placed_at", phase2End)
        .in("status", ["won", "lost", "push", "cashedout"])
        .order("placed_at", { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      tickets.push(...((data ?? []) as TicketRow[]));
      if (!data || data.length < 1000) break;
    }
    const p1 = phase1End == null ? [] : tickets.filter((t) => new Date(t.placed_at).getTime() < phase1End);
    const p2 = phase1End == null ? [] : tickets.filter((t) => new Date(t.placed_at).getTime() >= phase1End);
    const stats = {
      ...computeStats(tickets, capital),
      ...(phase1End != null ? { phase1: computeStats(p1, capital), phase2: computeStats(p2, capital) } : {}),
    };

    const row = {
      account_id: account.id,
      user_id: user.id,
      kind: KIND,
      display_name: displayName,
      package_key: account.package_key,
      capital,
      passed_at: phase2End,
      stats,
    };

    for (let attempt = 0; attempt < 6; attempt++) {
      const { data: inserted, error: insertError } = await supabase
        .from("certificates")
        .insert({ id: newCertificateId(), ...row })
        .select(PUBLIC_COLUMNS)
        .single();
      if (!insertError && inserted) return jsonResponse({ ok: true, certificate: publicCert(inserted) });
      if (insertError?.code !== "23505") throw insertError;
      // unikátní konflikt: buď kolize ID (zkusit znovu), nebo souběžné vydání
      // pro stejný účet — pak vrátit ten, který vyhrál
      const { data: raced } = await supabase
        .from("certificates")
        .select(PUBLIC_COLUMNS)
        .eq("account_id", account.id)
        .eq("kind", KIND)
        .maybeSingle();
      if (raced) return jsonResponse({ ok: true, certificate: publicCert(raced) });
    }
    throw new Error("Could not allocate a certificate ID.");
  } catch (err) {
    console.error("certificate-issue error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Certificate could not be issued." },
      500,
    );
  }
});
