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
export function accountClosedHtml(pkgName: string, reason: string, restartLink: string, resetPrice?: number): string {
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">Your ${pkgName} account was closed</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 8px">Reason: <span style="color:#e8e8ec">${reason}</span></p>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 20px">This only ever affects your simulated account — nothing else. You can start a new evaluation any time.${resetPrice ? ` Or restart your ${pkgName} package with a discounted reset: <b style="color:#e8e8ec">$${resetPrice}</b> (40% of the standard price) — sign in to your dashboard and click <b style="color:#e8e8ec">Reset my account</b>.` : " Restarting the same package is discounted to 40% of the standard price."}</p>
      <a href="${restartLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">${resetPrice ? "Reset my account" : "Start a new Challenge"}</a>
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

// Admin notifikace — hráč splnil cíl fáze a čeká na schválení (viz
// sync-account's enteringPending). Na rozdíl od ostatních šablon v tomhle
// souboru nejde o e-mail hráči, ale internímu týmu (SUPPORT_NOTIFY_EMAIL) —
// stejný účel/vzor jako notifikace na nový support tiket v support-submit.
export function pendingApprovalAdminHtml(params: {
  email: string;
  packageName: string;
  fromPhase: number;
  toPhase: number; // 3 = funded
  balance: number;
  profit: number;
  adminLink: string;
}): string {
  const toLabel = params.toPhase === 3 ? "Funded" : `Phase ${params.toPhase}`;
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">Phase approval needed</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 4px">${params.email.replace(/</g, "&lt;")} (${params.packageName}) cleared Phase ${params.fromPhase} and is waiting to move to ${toLabel}.</p>
      <p style="color:#a0a0ab;font-size:13px;line-height:1.6;margin:0 0 20px">Balance: $${Math.round(params.balance).toLocaleString("en-US")} · Profit this phase: $${Math.round(params.profit).toLocaleString("en-US")}</p>
      <a href="${params.adminLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">Review in admin</a>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      <p style="color:#5a5a66;font-size:11px;line-height:1.6;margin:0">Players → Čeká na schválenie</p>
    </div>
  </div>`;
}

// "Preview signup" welcome e-mail — sent once, right after someone creates
// a free preview account from the homepage "Preview" button (no package
// purchased yet). Combines a welcome note, a soft feedback ask, and the
// NEWFUNDLY discount code so they have a reason to come back and buy.
export function previewWelcomeHtml(dashboardLink: string): string {
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">Welcome to your Fundly preview</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 16px">Your dashboard is ready — browse real live matches and odds, and see exactly how Fundly works before you commit to anything.</p>
      <a href="${dashboardLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px;margin-bottom:20px">Open my dashboard</a>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 8px">Ready to start a real evaluation? Here's 40% off any package:</p>
      <div style="background:#14f19522;border:1px solid #14f19555;border-radius:10px;padding:14px 20px;text-align:center;font-family:'SF Mono',ui-monospace,monospace;font-size:20px;font-weight:700;letter-spacing:.08em;color:#14f195;margin:0 0 20px">NEWFUNDLY</div>
      <p style="color:#5a5a66;font-size:13px;line-height:1.6;margin:0 0 20px">How did the dashboard feel? Just reply to this e-mail — we read every message.</p>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      <p style="color:#5a5a66;font-size:11px;line-height:1.6;margin:0">Grindit LLC · Sharjah Media City, Sharjah, UAE · Reg. 2541536<br />Questions? Reach us at <a href="mailto:support@fundly.games" style="color:#7a7a86">support@fundly.games</a>.</p>
    </div>
  </div>`;
}

// "Welcome" e-mail for a checkout registration (client-side auth.signUp()
// in checkout.js, step 2 — before the Whop payment redirect). Unlike
// previewWelcomeHtml this isn't about the dashboard being "ready to browse"
// (they're already mid-purchase) — the code here is framed as a keepsake for
// a future reset or a friend's first Challenge, not a discount on the order
// they're about to place.
export function checkoutWelcomeHtml(dashboardLink: string): string {
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">Welcome to Fundly</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 16px">Your account is set up. Once your payment goes through you'll find your Challenge waiting in the dashboard.</p>
      <a href="${dashboardLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px;margin-bottom:20px">Open my dashboard</a>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 8px">A welcome gift — 40% off a future Challenge (yours, or share it with a friend):</p>
      <div style="background:#14f19522;border:1px solid #14f19555;border-radius:10px;padding:14px 20px;text-align:center;font-family:'SF Mono',ui-monospace,monospace;font-size:20px;font-weight:700;letter-spacing:.08em;color:#14f195;margin:0 0 20px">NEWFUNDLY</div>
      <p style="color:#5a5a66;font-size:13px;line-height:1.6;margin:0 0 20px">Questions about your account or your order? Just reply to this e-mail.</p>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      <p style="color:#5a5a66;font-size:11px;line-height:1.6;margin:0">Grindit LLC · Sharjah Media City, Sharjah, UAE · Reg. 2541536<br />Questions? Reach us at <a href="mailto:support@fundly.games" style="color:#7a7a86">support@fundly.games</a>.</p>
    </div>
  </div>`;
}

// "3 days later, still haven't bought" nurture e-mail — sent once by the
// last50-reminder cron job to anyone in preview_signups (Preview button OR
// checkout registration) who registered 3+ days ago and still has no
// challenge_accounts row. Targets the Advanced package specifically (the
// middle tier of the 5) rather than "any package", so the price in the
// e-mail is concrete and always computed from the live PACKAGES map.
export function last50Html(pkg: { name: string; price: number; cap: number }, checkoutLink: string): string {
  const halfPrice = Math.round(pkg.price / 2);
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">Still thinking it over?</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 16px">You looked around a few days ago but never started a Challenge. Here's 50% off the ${pkg.name} package — $${pkg.cap.toLocaleString("en-US")} simulated capital for $${halfPrice} instead of $${pkg.price}:</p>
      <div style="background:#14f19522;border:1px solid #14f19555;border-radius:10px;padding:14px 20px;text-align:center;font-family:'SF Mono',ui-monospace,monospace;font-size:20px;font-weight:700;letter-spacing:.08em;color:#14f195;margin:0 0 20px">LAST50</div>
      <a href="${checkoutLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">Claim my capital →</a>
      <p style="color:#5a5a66;font-size:13px;line-height:1.6;margin:20px 0 0">Questions before you start? Just reply to this e-mail.</p>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      <p style="color:#5a5a66;font-size:11px;line-height:1.6;margin:0">Grindit LLC · Sharjah Media City, Sharjah, UAE · Reg. 2541536<br />Questions? Reach us at <a href="mailto:support@fundly.games" style="color:#7a7a86">support@fundly.games</a>.</p>
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
