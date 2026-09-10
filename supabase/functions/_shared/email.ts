// _shared/email.ts — volitelné odesílání transakčních e-mailů přes Resend.
// Bez RESEND_API_KEY (secrets set) tiše přeskočí — nic to neblokuje, jen se
// e-mail neodešle (stejný vzor jako meta-ads-spend bez Meta klíčů).
// Nastavení: supabase secrets set RESEND_API_KEY=re_... RESEND_FROM="Fundly <support@fundly.games>"
// (RESEND_FROM musí být na ověřené doméně v Resend účtu, jinak Resend odešle jen na váš vlastní e-mail).

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY not set" };
  const from = Deno.env.get("RESEND_FROM") ?? "Fundly <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: params.to, subject: params.subject, html: params.html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, error: `Resend HTTP ${res.status}: ${body}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// "Account closed" e-mail — sent once, the moment a challenge_accounts row
// first transitions into state "breached" (loss-limit breach detected by
// the client at bet-settlement time, or the account-maintenance cron's
// 14-day inactivity burn). `reason` is the same breach_reason stored on the
// row, already a short human sentence (see portfolio.js breachInfo() /
// account-maintenance/index.ts).
export function accountClosedHtml(pkgName: string, reason: string, restartLink: string): string {
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">Your ${pkgName} account was closed</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 8px">Reason: <span style="color:#e8e8ec">${reason}</span></p>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 20px">This only ever affects your simulated account — nothing else. You can start a new evaluation any time; restarting the same package is discounted to 40% of the standard price.</p>
      <a href="${restartLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">Start a new Challenge</a>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      <p style="color:#5a5a66;font-size:11px;line-height:1.6;margin:0">Grindit LLC · Sharjah Media City, Sharjah, UAE · Reg. 2541536<br />Questions? Reply to this e-mail or reach us at <a href="mailto:support@fundly.games" style="color:#7a7a86">support@fundly.games</a>.</p>
    </div>
  </div>`;
}

// "Phase 1 passed" e-mail — sent once, the moment an admin approves the
// phase 1 → phase 2 transition (see approve-phase/index.ts). The account is
// reset fresh for phase 2 at the same moment (new baseline/target/day-limit),
// so this e-mail doubles as the "you can trade again" notice.
export function phase1PassedHtml(pkgName: string, dashboardLink: string): string {
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">Phase 1 passed 🎉</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 8px">Your ${pkgName} account cleared Phase 1 and has been verified by our team.</p>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 20px">You're now on Phase 2 — the account balance and daily limits have been reset for a fresh start. Keep the same discipline and you're one step from a funded partner account.</p>
      <a href="${dashboardLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">Go to my dashboard</a>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      <p style="color:#5a5a66;font-size:11px;line-height:1.6;margin:0">Grindit LLC · Sharjah Media City, Sharjah, UAE · Reg. 2541536<br />Questions? Reply to this e-mail or reach us at <a href="mailto:support@fundly.games" style="color:#7a7a86">support@fundly.games</a>.</p>
    </div>
  </div>`;
}

// "Funded" e-mail — sent once, the moment an admin approves the phase 2 →
// funded transition. Explicitly covers both milestones (clearing Phase 2 AND
// going funded), since in this two-phase model they're the same event.
export function fundedHtml(pkgName: string, profitSplit: number, dashboardLink: string): string {
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">You're funded! 🏆</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 8px">Your ${pkgName} account cleared Phase 2 and has been verified by our team — welcome to the partner program.</p>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 20px">Your account has been reset for the funded stage with a ${profitSplit}% performance split, unlimited time, and regular payouts. Keep at least one bet every 14 days to stay active.</p>
      <a href="${dashboardLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">Go to my dashboard</a>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      <p style="color:#5a5a66;font-size:11px;line-height:1.6;margin:0">Grindit LLC · Sharjah Media City, Sharjah, UAE · Reg. 2541536<br />Questions? Reply to this e-mail or reach us at <a href="mailto:support@fundly.games" style="color:#7a7a86">support@fundly.games</a>.</p>
    </div>
  </div>`;
}

export function supportReplyHtml(originalMessage: string, reply: string): string {
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">Reply to your message</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;white-space:pre-wrap">${reply.replace(/</g, "&lt;")}</p>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:20px 0" />
      <p style="color:#5a5a66;font-size:12px;margin:0 0 6px">Your original message:</p>
      <p style="color:#7a7a86;font-size:13px;line-height:1.5;white-space:pre-wrap">${originalMessage.replace(/</g, "&lt;")}</p>
    </div>
  </div>`;
}
