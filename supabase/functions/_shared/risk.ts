// _shared/risk.ts — server-side část risk-scoringu (anti-fraud).
// Klientská část (arbitráž, value-bety, rapid-fire, outlier kurzy, ...) se
// počítá v js/dashboard.js (computeRisk) a chodí přes sync-account jako
// riskScore/riskReasons. Tahle vrstva doplňuje signály, které klient vidět
// NEMŮŽE (napříč účty) — sdílené IP/platební metoda a rychlost postupu.
//
// Skórovací tabulka (dohodnuto s ownerem):
//   CRITICAL → +100 (kdekoli jeden stačí na auto-hold)
//   WARNING  → +15 každý
//   INFO     → +0 (jen kontext, nikdy sám o sobě důvod k akci)
// Prahy: skóre >=100 → hold (payout vyžaduje ruční potvrzení),
//        skóre 30–99 → watch (payout projde, účet se sleduje),
//        skóre <30   → clear.

export const RISK_CRITICAL = 100;
export const RISK_WARNING = 15;

export type WatchStatus = "clear" | "watch" | "hold";

export function watchStatusFor(score: number): WatchStatus {
  if (score >= 100) return "hold";
  if (score >= 30) return "watch";
  return "clear";
}

// deno-lint-ignore no-explicit-any
export async function computeServerRiskSignals(supabase: any, account: {
  id: string;
  signup_ip: string | null;
  payment_fingerprint: string | null;
  phase1_completed_at: string | null;
  funded_at: string | null;
  created_at: string;
}): Promise<{ score: number; reasons: string[] }> {
  let score = 0;
  const reasons: string[] = [];

  // SHARED_DEVICE_IP (CRITICAL): jiný účet se stejným IP při registraci.
  if (account.signup_ip) {
    const { count } = await supabase
      .from("challenge_accounts")
      .select("id", { count: "exact", head: true })
      .eq("signup_ip", account.signup_ip)
      .neq("id", account.id);
    if ((count ?? 0) > 0) {
      score += RISK_CRITICAL;
      reasons.push("SHARED_DEVICE_IP: sdílené IP s jiným účtem");
    }
  }

  // SHARED_PAYMENT_METHOD (CRITICAL): jiný účet platil stejnou kartou/metodou.
  if (account.payment_fingerprint) {
    const { count } = await supabase
      .from("challenge_accounts")
      .select("id", { count: "exact", head: true })
      .eq("payment_fingerprint", account.payment_fingerprint)
      .neq("id", account.id);
    if ((count ?? 0) > 0) {
      score += RISK_CRITICAL;
      reasons.push("SHARED_PAYMENT_METHOD: stejná platební metoda jako jiný účet");
    }
  }

  // FAST_TRACK (WARNING): fáze 1 dokončena extrémně rychle (< 3 dny od založení).
  if (account.phase1_completed_at) {
    const days = (new Date(account.phase1_completed_at).getTime() - new Date(account.created_at).getTime()) / 86400000;
    if (days >= 0 && days < 3) {
      score += RISK_WARNING;
      reasons.push(`FAST_TRACK: fáze 1 dokončena za ${days.toFixed(1)} dne`);
    }
  }

  return { score: Math.min(100, score), reasons };
}
