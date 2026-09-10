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
