// profile-update — hráčská nastavení uložená na challenge účtu (přezdívka,
// sdílení na leaderboardu). Heslo/2FA se řeší přímo přes supabase-js na
// klientovi (auth.updateUser), sem nepatří.
// POST { nickname?, leaderboardOptIn? } + Authorization: Bearer <token>
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

// Přezdívka je veřejná (leaderboard-get) — základní filtr proti sprostým/
// urážlivým slovům v jazycích, které web podporuje (en/cs/es/pl/sk/hu).
// Nejde o dokonalý/leetspeak-proof filtr, jen rozumná první obrana — diakritika
// se normalizuje, takže "kokot"/"Kokot"/"kôkot" chytí stejně.
const NICKNAME_BLOCKLIST = [
  "kokot", "kurva", "kurwa", "pica", "pička", "curak", "čurák", "zmrd", "debil",
  "buzerant", "pico", "chuj", "huj",
  "fuck", "shit", "cunt", "nigger", "nigga", "faggot", "bitch", "whore", "rape",
  "hitler", "nazi", "puta", "mierda", "polla",
];
function normalizeForFilter(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function containsBlockedWord(s: string): boolean {
  const norm = normalizeForFilter(s);
  return NICKNAME_BLOCKLIST.some((w) => norm.includes(w));
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return jsonResponse({ error: "Please sign in first." }, 401);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return jsonResponse({ error: "Invalid access token." }, 401);

    const body = await req.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    if (body.nickname !== undefined) {
      const nick = String(body.nickname ?? "").trim().slice(0, 24);
      if (nick && containsBlockedWord(nick)) {
        return jsonResponse({ error: "That nickname isn't allowed — please choose another." }, 400);
      }
      patch.nickname = nick || null;
    }
    if (body.leaderboardOptIn !== undefined) {
      patch.leaderboard_opt_in = !!body.leaderboardOptIn;
    }
    if (body.payoutMethod !== undefined) {
      patch.payout_method = String(body.payoutMethod ?? "").trim().slice(0, 100) || null;
    }
    if (!Object.keys(patch).length) {
      return jsonResponse({ error: "Nothing to update." }, 400);
    }

    const { data: account } = await supabase
      .from("challenge_accounts")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!account) return jsonResponse({ error: "You have no challenge account." }, 400);

    const { error: updateError } = await supabase
      .from("challenge_accounts")
      .update(patch)
      .eq("id", account.id);
    if (updateError) throw updateError;

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("profile-update error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Update failed." },
      500,
    );
  }
});
