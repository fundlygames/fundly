// referral-get — program „Pozvi kamaráda" pro přihlášeného hráče (dashboard → Profil → Doporučení).
// POST + Authorization: Bearer <user access token> → jen vlastní data volajícího:
//   { eligible: false }  — hráč zatím nemá koupený účet (kód se nezakládá)
//   { eligible: true, code, link, active, discountPct, invited, paid, vouchers: { available, used } }
// invited = všichni, kdo s kódem došli k platbě (pending + paid), paid = kolik jich opravdu koupilo.
// Kód se založí při prvním volání (_shared/referral.ts → getOrCreateReferralCode).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { getOrCreateReferralCode, escapeLike, REFERRAL_DISCOUNT_PCT } from "../_shared/referral.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://fundly.games";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return jsonResponse({ error: "Please sign in." }, 401);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ověření uživatelského JWT proti auth serveru (stejně jako affiliate-stats)
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user?.email) return jsonResponse({ error: "Please sign in." }, 401);

    // kód dostane jen hráč s koupeným účtem (challenge_accounts podle user_id, jinak podle e-mailu)
    const { data: byId } = await supabase
      .from("challenge_accounts")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    let hasAccount = !!byId;
    if (!hasAccount) {
      const { data: byEmail } = await supabase
        .from("challenge_accounts")
        .select("id")
        .ilike("email", escapeLike(user.email.trim()))
        .limit(1)
        .maybeSingle();
      hasAccount = !!byEmail;
    }
    if (!hasAccount) return jsonResponse({ eligible: false, discountPct: REFERRAL_DISCOUNT_PCT });

    const { code, active } = await getOrCreateReferralCode(supabase, { id: user.id, email: user.email });

    const [{ data: atts, error: aErr }, { data: vouchers, error: vErr }] = await Promise.all([
      supabase.from("referral_attributions").select("status").eq("referrer_user_id", user.id),
      supabase.from("referral_vouchers").select("used_at, revoked_at").eq("user_id", user.id),
    ]);
    if (aErr) throw aErr;
    if (vErr) throw vErr;

    const list = (atts ?? []) as { status: string }[];
    const vlist = (vouchers ?? []) as { used_at: string | null; revoked_at: string | null }[];
    return jsonResponse({
      eligible: true,
      code,
      active,
      link: `${SITE_URL}/?ref=${encodeURIComponent(code)}`,
      discountPct: REFERRAL_DISCOUNT_PCT,
      invited: list.filter((a) => a.status === "pending" || a.status === "paid").length,
      paid: list.filter((a) => a.status === "paid").length,
      vouchers: {
        available: vlist.filter((v) => !v.used_at && !v.revoked_at).length,
        used: vlist.filter((v) => !!v.used_at).length,
      },
    });
  } catch (err) {
    console.error("referral-get error:", err);
    return jsonResponse({ error: "Referral data could not be loaded." }, 500);
  }
});
