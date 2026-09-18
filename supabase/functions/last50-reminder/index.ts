// last50-reminder — denní cron (pg_cron/pg_net, viz docs/WHOP-SETUP.md):
// 3 dny po registraci (Preview tlačítko NEBO checkout krok 2) bez nákupu
// pošle e-mail s kódem LAST50 (50 % sleva na balíček Advanced — "střední"
// z pěti). Nikdy nepošle dvakrát (last50_reminders_sent).
//
// "Kdo se zaregistroval, ale nezaplatil" se počítá stejně jako admin.html's
// "Sign-upy bez platby" panel: všichni v auth.users, jejichž e-mail nemá
// řádek v challenge_accounts ani payments.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { isValidAdminKey } from "../_shared/admin.ts";
import { sendEmail, last50Html } from "../_shared/email.ts";
import { packageByKey } from "../_shared/packages.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://fundly.games";
const WAIT_DAYS = 3;

serve(async (req) => {
  // volá pg_cron/pg_net server-to-server, chráněno x-admin-key (stejný vzor
  // jako account-maintenance) — nikdy se nevolá z prohlížeče.
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!(await isValidAdminKey(req))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cutoff = new Date(Date.now() - WAIT_DAYS * 24 * 60 * 60 * 1000);

    const [accounts, payments, alreadySent, authUsers] = await Promise.all([
      supabase.from("challenge_accounts").select("email"),
      supabase.from("payments").select("email"),
      supabase.from("last50_reminders_sent").select("email"),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (accounts.error) throw accounts.error;
    if (payments.error) throw payments.error;
    if (alreadySent.error) throw alreadySent.error;
    if (authUsers.error) throw authUsers.error;

    const paidEmails = new Set([
      ...(accounts.data ?? []).map((a) => String(a.email ?? "").toLowerCase()),
      ...(payments.data ?? []).map((p) => String(p.email ?? "").toLowerCase()),
    ]);
    const sentEmails = new Set(
      (alreadySent.data ?? []).map((r) => String(r.email).toLowerCase()),
    );

    // deno-lint-ignore no-explicit-any
    const users = (authUsers.data?.users ?? []) as any[];
    const candidates = users.filter((u) => {
      const email = String(u.email ?? "").toLowerCase();
      if (!email) return false;
      if (paidEmails.has(email)) return false; // already bought — not the audience for a "still thinking it over" nudge
      if (sentEmails.has(email)) return false; // already got this reminder
      const createdAt = new Date(u.created_at);
      return createdAt <= cutoff;
    });

    const pkg = packageByKey("advanced")!;
    let sent = 0;
    for (const u of candidates) {
      const email = String(u.email);
      const result = await sendEmail({
        to: email,
        subject: "50% off — last chance",
        html: last50Html(pkg, `${SITE_URL}/checkout?package=advanced`),
      });
      if (result.sent) {
        await supabase.from("last50_reminders_sent").insert({ email: email.toLowerCase() });
        sent++;
      } else {
        console.error("last50-reminder e-mail selhal pro", email, result.error);
      }
    }

    return jsonResponse({ ok: true, checked: users.length, candidates: candidates.length, sent });
  } catch (err) {
    console.error("last50-reminder error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "last50-reminder failed" },
      500,
    );
  }
});
