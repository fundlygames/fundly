// _shared/loss-enforce.ts — zavře účet, který podle tiketů v databázi překročil limit ztráty
// (viz loss-limits.ts). Volá se po každém sync-tickets / sync-account a v denním
// account-maintenance, takže upravený klient, který limit nehlásí (nebo vůbec nesyncuje),
// účet neuchrání. Vypínač: secret LOSS_LIMIT_ENFORCE=false (jen zaloguje "would close").
import { sendEmail, accountClosedHtml } from "./email.ts";
import { packageByKey, resetPrice } from "./packages.ts";
import { isExcludedFromExpiry } from "./phase-expiry.ts";
import { lossLimitBreach, type LossAccount, type LossTicket } from "./loss-limits.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://fundly.games";

// deno-lint-ignore no-explicit-any
export async function enforceLossLimits(supabase: any, accountId: string, dryRun = false): Promise<string | null> {
  const { data: acc } = await supabase
    .from("challenge_accounts")
    .select("id, email, package_key, capital, phase, state, phase_started_at, phase_baseline")
    .eq("id", accountId)
    .maybeSingle();
  if (!acc) return null;
  // interní / testovací účty (@fundly.games, balíček "test") se nezavírají — stejně jako u časového limitu
  if (isExcludedFromExpiry(acc, [])) return null;
  const { data: tix } = await supabase
    .from("tickets")
    .select("stake, payout, status, placed_at, settled_at")
    .eq("account_id", accountId);
  const reason = lossLimitBreach(acc as LossAccount, (tix ?? []) as LossTicket[], Date.now());
  if (!reason) return null;

  const enforce = Deno.env.get("LOSS_LIMIT_ENFORCE") !== "false" && !dryRun;
  if (!enforce) {
    console.error(`loss-limits WOULD_CLOSE: account ${accountId} — ${reason}`);
    return reason;
  }
  // přechod jen z active / pending_approval (breached je terminální) — a e-mail jen při prvním přechodu
  const { data: closed, error } = await supabase
    .from("challenge_accounts")
    .update({ state: "breached", breach_reason: reason, pending_phase: null, synced_at: new Date().toISOString() })
    .eq("id", accountId)
    .in("state", ["active", "pending_approval"])
    .select("id");
  if (error) { console.error("loss-limits close selhalo:", accountId, error); return null; }
  console.error(`loss-limits CLOSED: account ${accountId} — ${reason}`);
  if (closed?.length && acc.email) {
    const pkg = packageByKey(String(acc.package_key ?? ""));
    sendEmail({
      to: String(acc.email),
      subject: "Your Fundly account was closed",
      html: accountClosedHtml(pkg.name, reason, `${SITE_URL}/dashboard`, resetPrice(pkg)),
    }).then((r) => { if (!r.sent) console.error("account-closed e-mail selhal:", r.error); })
      .catch((e) => console.error("account-closed e-mail error:", e));
  }
  return reason;
}
