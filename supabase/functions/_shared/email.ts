// _shared/email.ts — volitelné odesílání transakčních e-mailů přes Resend.
// Bez RESEND_API_KEY (secrets set) tiše přeskočí — nic to neblokuje, jen se
// e-mail neodešle (stejný vzor jako meta-ads-spend bez Meta klíčů).
// Nastavení: supabase secrets set RESEND_API_KEY=re_... RESEND_FROM="Fundly <support@fundly.games>"
// (RESEND_FROM musí být na ověřené doméně v Resend účtu, jinak Resend odešle jen na váš vlastní e-mail).
//
// Jazyky: šablony pro hráče mají poslední parametr `lang` (výchozí "en", takže staré
// volání funguje beze změny). "cs" = česky (i pro slovenské hráče), cokoli jiného = anglicky.
// Jazyk hráče zjistí _shared/user-lang.ts (userLang); předměty jsou v `subjects` níže.

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
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
      body: JSON.stringify({ from, to: params.to, subject: params.subject, html: params.html, ...(params.headers ? { headers: params.headers } : {}) }),
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

// ---------------------------------------------------------------------------
// Společné kousky šablon
// ---------------------------------------------------------------------------
const isCs = (lang?: string | null) => lang === "cs";

/** Částka v USD bez desetinných míst: "$25,000" (en) / "$25 000" (cs). */
function money(n: number, lang?: string | null): string {
  return "$" + Number(n).toLocaleString(isCs(lang) ? "cs-CZ" : "en-US");
}

/** Česká množná čísla: 1 den, 2–4 dny, 5+ dní. */
export function csPlural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n);
  if (a === 1) return one;
  if (a >= 2 && a <= 4) return few;
  return many;
}

const OPERATOR = "Grindit LLC · Sharjah Media City, Sharjah, UAE · Reg. 2541536";
const SUPPORT_LINK = `<a href="mailto:support@fundly.games" style="color:#7a7a86">support@fundly.games</a>`;

// Patička: "reply" = "Questions? Reply to this e-mail or reach us at …", "reach" = "Questions? Reach us at …".
function footer(kind: "reply" | "reach", lang?: string | null): string {
  const q = isCs(lang)
    ? (kind === "reply" ? `Máš otázky? Odpověz na tento e-mail nebo nám napiš na ${SUPPORT_LINK}.` : `Máš otázky? Napiš nám na ${SUPPORT_LINK}.`)
    : (kind === "reply" ? `Questions? Reply to this e-mail or reach us at ${SUPPORT_LINK}.` : `Questions? Reach us at ${SUPPORT_LINK}.`);
  return `<p style="color:#5a5a66;font-size:11px;line-height:1.6;margin:0">${OPERATOR}<br />${q}</p>`;
}

/**
 * Důvod uzavření účtu (breach_reason) v jazyce e-mailu. V DB zůstává anglicky
 * (viz loss-limits.ts, phase-expiry.ts, account-maintenance, js/portfolio.js breachInfo);
 * neznámý text se vrátí beze změny.
 */
export function localizeReason(reason: string, lang?: string | null): string {
  if (!isCs(lang)) return reason;
  const r = String(reason ?? "").trim();
  let m: RegExpMatchArray | null;
  if ((m = r.match(/^Max\. loss exceeded \((static|trailing) -?(\d+(?:[.,]\d+)?) ?%\)$/i))) {
    return `Překročena max. celková ztráta (${m[1].toLowerCase() === "static" ? "statická" : "klouzavá"} −${m[2]} %)`;
  }
  if ((m = r.match(/^Max\. daily loss exceeded \(-?(\d+(?:[.,]\d+)?) ?%\)$/i))) {
    return `Překročena max. denní ztráta (−${m[1]} %)`;
  }
  if ((m = r.match(/^Phase (\d+) time limit exceeded \((\d+) days?\)$/i))) {
    const d = Number(m[2]);
    return `Vypršel časový limit Fáze ${m[1]} (${d} ${csPlural(d, "den", "dny", "dní")})`;
  }
  if ((m = r.match(/^Inactive for (\d+)\+ days$/i))) {
    return `Žádná aktivita ${m[1]} a více dní`;
  }
  if (/^Loss limit exceeded$/i.test(r)) return "Překročen limit ztráty";
  return r;
}

// ---------------------------------------------------------------------------
// Předměty e-mailů (en / cs)
// ---------------------------------------------------------------------------
export const subjects = {
  accountClosed: (lang?: string | null) => isCs(lang) ? "Tvůj účet Fundly byl uzavřen" : "Your Fundly account was closed",
  phase1Passed: (lang?: string | null) => isCs(lang) ? "Fáze 1 splněna — pokračuješ do Fáze 2" : "Phase 1 passed — you're on Phase 2",
  funded: (lang?: string | null) => isCs(lang) ? "Jsi Fundly Partner!" : "You're funded!",
  previewWelcome: (lang?: string | null) => isCs(lang) ? "Vítej v náhledu Fundly" : "Welcome to your Fundly preview",
  accountExistsSignIn: (lang?: string | null) => isCs(lang) ? "Tvůj přihlašovací odkaz do Fundly" : "Your Fundly sign-in link",
  phaseExpiryWarning: (phase: number, daysLeft: number, lang?: string | null) => isCs(lang)
    ? `Časový limit Fáze ${phase} ti končí za ${daysLeft} ${csPlural(daysLeft, "den", "dny", "dní")}`
    : `Your Fundly Phase ${phase} time limit ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`,
  checkoutWelcome: (lang?: string | null) => isCs(lang) ? "Vítej ve Fundly" : "Welcome to Fundly",
  last50: (lang?: string | null) => isCs(lang) ? "50% sleva — poslední šance" : "50% off — last chance",
  supportReply: (lang?: string | null) => isCs(lang) ? "Odpověď od podpory Fundly" : "Reply from Fundly support",
  discountCode: (lang?: string | null) => isCs(lang) ? "Tvůj kód na 30% slevu na Fundly" : "Your 30% off Fundly code",
  waitlistJoined: (lang?: string | null) => isCs(lang) ? "Jsi na čekací listině Fundly" : "You're on the Fundly waitlist",
  waitlistInvite: (lang?: string | null) => isCs(lang) ? "Ve Fundly se pro tebe uvolnilo místo" : "A Fundly spot just opened up for you",
  purchaseConfirmed: (lang?: string | null) => isCs(lang) ? "Platba potvrzena — tvůj účet Fundly je aktivní" : "Payment confirmed — your Fundly account is active",
};

// "Account closed" e-mail — sent once, the moment a challenge_accounts row
// first transitions into state "breached" (loss-limit breach detected by
// the client at bet-settlement time, or the account-maintenance cron's
// 14-day inactivity burn). `reason` is the same breach_reason stored on the
// row, already a short human sentence (see portfolio.js breachInfo() /
// account-maintenance/index.ts) — in Czech it is translated by localizeReason().
export function accountClosedHtml(pkgName: string, reason: string, restartLink: string, resetPrice?: number, lang: string = "en"): string {
  const cs = isCs(lang);
  const shownReason = localizeReason(reason, lang);
  const t = cs
    ? {
      h: `Tvůj účet ${pkgName} byl uzavřen`,
      reason: "Důvod:",
      body: `Týká se to jen tvého simulovaného účtu — nic jiného. Novou Challenge můžeš začít kdykoli.${resetPrice ? ` Nebo restartuj svůj balíček ${pkgName} se zvýhodněným resetem: <b style="color:#e8e8ec">${money(resetPrice, lang)}</b> (40 % standardní ceny) — přihlas se do dashboardu a klikni na <b style="color:#e8e8ec">Resetovat můj účet</b>.` : " Restart stejného balíčku je zvýhodněný na 40 % standardní ceny."}`,
      btn: resetPrice ? "Resetovat můj účet" : "Začít novou Challenge",
    }
    : {
      h: `Your ${pkgName} account was closed`,
      reason: "Reason:",
      body: `This only ever affects your simulated account — nothing else. You can start a new evaluation any time.${resetPrice ? ` Or restart your ${pkgName} package with a discounted reset: <b style="color:#e8e8ec">$${resetPrice}</b> (40% of the standard price) — sign in to your dashboard and click <b style="color:#e8e8ec">Reset my account</b>.` : " Restarting the same package is discounted to 40% of the standard price."}`,
      btn: resetPrice ? "Reset my account" : "Start a new Challenge",
    };
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">${t.h}</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 8px">${t.reason} <span style="color:#e8e8ec">${shownReason}</span></p>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 20px">${t.body}</p>
      <a href="${restartLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">${t.btn}</a>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      ${footer("reply", lang)}
    </div>
  </div>`;
}

// "Phase 1 passed" e-mail — sent once, the moment an admin approves the
// phase 1 → phase 2 transition (see approve-phase/index.ts). The account is
// reset fresh for phase 2 at the same moment (new baseline/target/day-limit),
// so this e-mail doubles as the "you can trade again" notice.
export function phase1PassedHtml(pkgName: string, dashboardLink: string, lang: string = "en"): string {
  const t = isCs(lang)
    ? {
      h: "Fáze 1 splněna 🎉",
      p1: `Tvůj účet ${pkgName} splnil Fázi 1 a náš tým ho ověřil.`,
      p2: "Teď jsi ve Fázi 2 — zůstatek účtu i denní limity se nastavily nanovo, takže začínáš s čistým štítem. Drž stejnou disciplínu a od účtu Fundly Partner tě dělí už jen jeden krok.",
      btn: "Přejít do dashboardu",
    }
    : {
      h: "Phase 1 passed 🎉",
      p1: `Your ${pkgName} account cleared Phase 1 and has been verified by our team.`,
      p2: "You're now on Phase 2 — the account balance and daily limits have been reset for a fresh start. Keep the same discipline and you're one step from a funded partner account.",
      btn: "Go to my dashboard",
    };
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">${t.h}</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 8px">${t.p1}</p>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 20px">${t.p2}</p>
      <a href="${dashboardLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">${t.btn}</a>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      ${footer("reply", lang)}
    </div>
  </div>`;
}

// "Funded" e-mail — sent once, the moment an admin approves the phase 2 →
// funded transition. Explicitly covers both milestones (clearing Phase 2 AND
// going funded), since in this two-phase model they're the same event.
export function fundedHtml(pkgName: string, profitSplit: number, dashboardLink: string, lang: string = "en"): string {
  const t = isCs(lang)
    ? {
      h: "Jsi Fundly Partner! 🏆",
      p1: `Tvůj účet ${pkgName} splnil Fázi 2 a náš tým ho ověřil — vítej v partnerském programu.`,
      p2: `Účet je připravený na partnerskou fázi: ${profitSplit}% podíl z výkonu, neomezený čas a pravidelné odměny. Aby účet zůstal aktivní, podej aspoň jeden tip každých 14 dní.`,
      btn: "Přejít do dashboardu",
    }
    : {
      h: "You're funded! 🏆",
      p1: `Your ${pkgName} account cleared Phase 2 and has been verified by our team — welcome to the partner program.`,
      p2: `Your account has been reset for the funded stage with a ${profitSplit}% performance split, unlimited time, and regular rewards. Submit at least one tip every 14 days to stay active.`,
      btn: "Go to my dashboard",
    };
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">${t.h}</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 8px">${t.p1}</p>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 20px">${t.p2}</p>
      <a href="${dashboardLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">${t.btn}</a>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      ${footer("reply", lang)}
    </div>
  </div>`;
}

// Admin notifikace — hráč splnil cíl fáze a čeká na schválení (viz
// sync-account's enteringPending). Na rozdíl od ostatních šablon v tomhle
// souboru nejde o e-mail hráči, ale internímu týmu (SUPPORT_NOTIFY_EMAIL) —
// stejný účel/vzor jako notifikace na nový support tiket v support-submit.
// Interní → zůstává jen anglicky.
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
export function previewWelcomeHtml(dashboardLink: string, lang: string = "en"): string {
  const t = isCs(lang)
    ? {
      h: "Vítej v náhledu Fundly",
      p1: "Tvůj dashboard je připravený — prohlédni si skutečné živé zápasy a kurzy a podívej se, jak Fundly funguje, ještě než se k čemukoli zavážeš.",
      btn: "Otevřít můj dashboard",
      p2: "Chceš začít skutečné hodnocení? Tady máš 30% slevu na jakýkoli balíček:",
      p3: "Jak se ti dashboard líbil? Stačí odpovědět na tento e-mail — čteme každou zprávu.",
    }
    : {
      h: "Welcome to your Fundly preview",
      p1: "Your dashboard is ready — browse real live matches and odds, and see exactly how Fundly works before you commit to anything.",
      btn: "Open my dashboard",
      p2: "Ready to start a real evaluation? Here's 30% off any package:",
      p3: "How did the dashboard feel? Just reply to this e-mail — we read every message.",
    };
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">${t.h}</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 16px">${t.p1}</p>
      <a href="${dashboardLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px;margin-bottom:20px">${t.btn}</a>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 8px">${t.p2}</p>
      <div style="background:#14f19522;border:1px solid #14f19555;border-radius:10px;padding:14px 20px;text-align:center;font-family:'SF Mono',ui-monospace,monospace;font-size:20px;font-weight:700;letter-spacing:.08em;color:#14f195;margin:0 0 20px">NEWFUNDLY</div>
      <p style="color:#5a5a66;font-size:13px;line-height:1.6;margin:0 0 20px">${t.p3}</p>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      ${footer("reach", lang)}
    </div>
  </div>`;
}

// "You already have an account" e-mail — sent instead of a dead-end error
// when someone tries the Preview signup (js/main.js) with an e-mail that
// already has an account (most commonly: they registered at checkout —
// js/checkout.js no longer collects a password there, see whop-webhook's
// magic-link, so there is no password for them to "just log in" with).
// A plain sign-in link, not a password reset: nothing about their account
// needs changing, they just need a way in.
export function accountExistsSignInHtml(dashboardLink: string, lang: string = "en"): string {
  const t = isCs(lang)
    ? {
      h: "Tady je tvůj přihlašovací odkaz",
      p1: "S tímto e-mailem už účet Fundly máš, takže nový jsme nezakládali — klikni níže a dostaneš se rovnou do svého dashboardu.",
      btn: "Otevřít můj dashboard",
      p2: "Nejsi to ty, nebo jsi tenhle e-mail nečekal(a)? Klidně ho ignoruj, nebo odpověz a pomůžeme ti.",
    }
    : {
      h: "Here's your sign-in link",
      p1: "This e-mail already has a Fundly account, so we skipped making a new one — click below to get straight into your dashboard.",
      btn: "Open my dashboard",
      p2: "Not you, or not expecting this? Just ignore this e-mail, or reply and we'll help.",
    };
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">${t.h}</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 16px">${t.p1}</p>
      <a href="${dashboardLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px;margin-bottom:20px">${t.btn}</a>
      <p style="color:#5a5a66;font-size:13px;line-height:1.6;margin:0 0 20px">${t.p2}</p>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      ${footer("reach", lang)}
    </div>
  </div>`;
}

/** Datum konce lhůty fáze pro e-mail (UTC): "15 November 2026" / "15. listopadu 2026". */
export function deadlineLabel(ms: number, lang: string = "en"): string {
  return new Date(ms).toLocaleDateString(isCs(lang) ? "cs-CZ" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// Upozornění pár dní před koncem 30denní lhůty fáze (viz _shared/phase-expiry.ts,
// account-maintenance). Posílá se jen hráči, který cíl fáze ještě nesplnil.
export function phaseExpiryWarningHtml(p: {
  pkgName: string; phase: number; deadlineLabel: string; daysLeft: number;
  remainingProfit: number; targetProfit: number; resetPrice: number;
  dashboardLink: string; rulesLink: string;
}, lang: string = "en"): string {
  const cs = isCs(lang);
  const target = money(p.targetProfit, lang);
  const t = cs
    ? {
      days: p.daysLeft === 1 ? "Zbývá 1 den" : `${csPlural(p.daysLeft, "Zbývá", "Zbývají", "Zbývá")} ${p.daysLeft} ${csPlural(p.daysLeft, "den", "dny", "dní")}`,
      label: `Časový limit Fáze ${p.phase}`,
      ends: `končí ${p.deadlineLabel} (UTC)`,
      status: p.remainingProfit > 0
        ? `Do cílového zisku (+${target}) ti teď chybí zhruba <b style="color:#ffffff">${money(p.remainingProfit, lang)}</b>.`
        : `Cílového zisku (+${target}) jsi už dosáhl(a) &mdash; ověř si, že máš i potřebné kvalifikační tipy.`,
      p1: `Tvůj účet ${p.pkgName} má na každou fázi časový limit 30 dní. Abys Fázi ${p.phase} splnil(a), musíš do jejího konce dosáhnout cílového zisku a mít potřebné kvalifikační tipy.`,
      p2: `Pokud časový limit uplyne a fáze nebude splněná, účet se uzavře podle <a href="${p.rulesLink}" style="color:#14f195">pravidel Challenge</a>. Stejný balíček pak můžeš restartovat za zvýhodněnou cenu resetu ${money(p.resetPrice, lang)}.`,
      btn: "Otevřít můj dashboard",
      q: "Máš otázky? Stačí odpovědět na tento e-mail &mdash; čte ho skutečný člověk.",
      why: "Toto servisní upozornění dostáváš, protože máš aktivní účet Fundly. Fundly nabízí výhradně simulované účty, nepracuje se se skutečnými penězi.",
    }
    : {
      days: p.daysLeft === 1 ? "1 day left" : `${p.daysLeft} days left`,
      label: `Phase ${p.phase} time limit`,
      ends: `ends on ${p.deadlineLabel} (UTC)`,
      status: p.remainingProfit > 0
        ? `You are currently about <b style="color:#ffffff">${money(p.remainingProfit, lang)}</b> short of the profit target (+${target}).`
        : `You have reached the profit target (+${target}) &mdash; make sure you also have the required qualifying tips.`,
      p1: `Your ${p.pkgName} account has a 30-day time limit per phase. To pass Phase ${p.phase} you need to reach the profit target and the required qualifying tips before it ends.`,
      p2: `If the time limit passes without the phase being completed, the account is closed in line with the <a href="${p.rulesLink}" style="color:#14f195">challenge rules</a>. You can then restart the same package at the discounted reset price of ${money(p.resetPrice, lang)}.`,
      btn: "Open my dashboard",
      q: "Questions? Just reply to this e-mail &mdash; a real person reads it.",
      why: "You are receiving this service notice because you have an active Fundly account. Fundly offers simulated accounts only, no real-money trading.",
    };
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <div style="background:#1f1808;border:1px solid #f5b94255;border-radius:14px;padding:22px 18px;text-align:center;margin:0 0 20px">
        <div style="font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#a8935a">${t.label}</div>
        <div style="font-size:44px;line-height:1.1;font-weight:800;letter-spacing:-.02em;color:#f5b942;margin:8px 0 2px">${t.days}</div>
        <div style="font-size:14px;color:#c9c9d1;margin-top:6px">${t.ends}</div>
      </div>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 14px">${t.p1} ${t.status}</p>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 20px">${t.p2}</p>
      <a href="${p.dashboardLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px;margin-bottom:20px">${t.btn}</a>
      <p style="color:#5a5a66;font-size:13px;line-height:1.6;margin:0 0 20px">${t.q}</p>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      <p style="color:#5a5a66;font-size:11px;line-height:1.6;margin:0">${OPERATOR}<br />${t.why}</p>
    </div>
  </div>`;
}

// "Welcome" e-mail for a checkout registration (client-side auth.signUp()
// in checkout.js, step 2 — before the Whop payment redirect). Unlike
// previewWelcomeHtml this isn't about the dashboard being "ready to browse"
// (they're already mid-purchase) — the code here is framed as a keepsake for
// a future reset or a friend's first Challenge, not a discount on the order
// they're about to place.
export function checkoutWelcomeHtml(dashboardLink: string, lang: string = "en"): string {
  const t = isCs(lang)
    ? {
      h: "Vítej ve Fundly",
      p1: "Tvůj účet je založený. Jakmile projde platba, najdeš svou Challenge připravenou v dashboardu.",
      btn: "Otevřít můj dashboard",
      p2: "Tvoje 30% uvítací sleva se v pokladně uplatní automaticky — a kód můžeš poslat i kamarádovi:",
      p3: "Máš otázky k účtu nebo k objednávce? Stačí odpovědět na tento e-mail.",
    }
    : {
      h: "Welcome to Fundly",
      p1: "Your account is set up. Once your payment goes through you'll find your Challenge waiting in the dashboard.",
      btn: "Open my dashboard",
      p2: "Your 30% welcome discount is applied automatically at checkout — and you can share the code with a friend:",
      p3: "Questions about your account or your order? Just reply to this e-mail.",
    };
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">${t.h}</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 16px">${t.p1}</p>
      <a href="${dashboardLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px;margin-bottom:20px">${t.btn}</a>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 8px">${t.p2}</p>
      <div style="background:#14f19522;border:1px solid #14f19555;border-radius:10px;padding:14px 20px;text-align:center;font-family:'SF Mono',ui-monospace,monospace;font-size:20px;font-weight:700;letter-spacing:.08em;color:#14f195;margin:0 0 20px">NEWFUNDLY</div>
      <p style="color:#5a5a66;font-size:13px;line-height:1.6;margin:0 0 20px">${t.p3}</p>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      ${footer("reach", lang)}
    </div>
  </div>`;
}

// "3 days later, still haven't bought" nurture e-mail — sent once by the
// last50-reminder cron job to anyone in preview_signups (Preview button OR
// checkout registration) who registered 3+ days ago and still has no
// challenge_accounts row. Targets the Advanced package specifically (the
// middle tier of the 5) rather than "any package", so the price in the
// e-mail is concrete and always computed from the live PACKAGES map.
export function last50Html(pkg: { name: string; price: number; cap: number }, checkoutLink: string, lang: string = "en"): string {
  const halfPrice = Math.round(pkg.price / 2);
  const t = isCs(lang)
    ? {
      h: "Pořád si to rozmýšlíš?",
      p1: `Před pár dny ses u nás porozhlédl(a), ale Challenge jsi zatím nezačal(a). Tady máš 50% slevu na balíček ${pkg.name} — ${money(pkg.cap, lang)} simulovaného kapitálu za ${money(halfPrice, lang)} místo ${money(pkg.price, lang)}:`,
      btn: "Získat svůj kapitál →",
      p2: "Máš otázky, než začneš? Stačí odpovědět na tento e-mail.",
    }
    : {
      h: "Still thinking it over?",
      p1: `You looked around a few days ago but never started a Challenge. Here's 50% off the ${pkg.name} package — $${pkg.cap.toLocaleString("en-US")} simulated capital for $${halfPrice} instead of $${pkg.price}:`,
      btn: "Claim my capital →",
      p2: "Questions before you start? Just reply to this e-mail.",
    };
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">${t.h}</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 16px">${t.p1}</p>
      <div style="background:#14f19522;border:1px solid #14f19555;border-radius:10px;padding:14px 20px;text-align:center;font-family:'SF Mono',ui-monospace,monospace;font-size:20px;font-weight:700;letter-spacing:.08em;color:#14f195;margin:0 0 20px">LAST50</div>
      <a href="${checkoutLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">${t.btn}</a>
      <p style="color:#5a5a66;font-size:13px;line-height:1.6;margin:20px 0 0">${t.p2}</p>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      ${footer("reach", lang)}
    </div>
  </div>`;
}

// Odpověď podpory (support-manage). Text odpovědi píše admin — ten se nepřekládá,
// jen rámeček e-mailu.
export function supportReplyHtml(originalMessage: string, reply: string, lang: string = "en"): string {
  const t = isCs(lang)
    ? { h: "Odpověď na tvou zprávu", orig: "Tvoje původní zpráva:" }
    : { h: "Reply to your message", orig: "Your original message:" };
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">${t.h}</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;white-space:pre-wrap">${reply.replace(/</g, "&lt;")}</p>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:20px 0" />
      <p style="color:#5a5a66;font-size:12px;margin:0 0 6px">${t.orig}</p>
      <p style="color:#7a7a86;font-size:13px;line-height:1.5;white-space:pre-wrap">${originalMessage.replace(/</g, "&lt;")}</p>
    </div>
  </div>`;
}

// Kód NEWFUNDLY z pop-upu se slevou (discount-signup).
export function discountCodeHtml(code: string, getStartedLink: string, lang: string = "en"): string {
  const t = isCs(lang)
    ? { h: "Tady je tvůj kód na 30% slevu", p: "Zadej tento kód v pokladně u jakéhokoli balíčku:", btn: "Získat svůj kapitál" }
    : { h: "Here's your 30% off code", p: "Enter this code at checkout on any package:", btn: "Get funded now" };
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">${t.h}</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 20px">${t.p}</p>
      <div style="background:#14f19522;border:1px solid #14f19555;border-radius:10px;padding:14px 20px;text-align:center;font-family:'SF Mono',ui-monospace,monospace;font-size:20px;font-weight:700;letter-spacing:.08em;color:#14f195;margin:0 0 20px">${code}</div>
      <a href="${getStartedLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">${t.btn}</a>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      ${footer("reach", lang)}
    </div>
  </div>`;
}

// Potvrzení zápisu na waitlist (waitlist-join).
export function waitlistJoinedHtml(pkgName: string | null, lang: string = "en"): string {
  const t = isCs(lang)
    ? { h: "Jsi na čekací listině", p: `Startovní místa jsou teď plně obsazená. Jakmile se uvolní místo${pkgName ? ` pro balíček ${pkgName}` : ""}, pošleme ti e-mailem odkaz s pozvánkou.` }
    : { h: "You're on the waitlist", p: `Launch spots are full right now. We'll email you an invite link as soon as a spot opens up${pkgName ? ` for the ${pkgName} package` : ""}.` };
  return `<div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
        <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
          <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
          <h2 style="color:#fff;font-size:18px;margin:0 0 12px">${t.h}</h2>
          <p style="color:#a0a0ab;font-size:14px;line-height:1.6">${t.p}</p>
        </div>
      </div>`;
}

// Pozvánka z waitlistu (waitlist-manage).
export function waitlistInviteHtml(email: string, link: string, lang: string = "en"): string {
  const t = isCs(lang)
    ? { h: "Právě se uvolnilo místo", p: `Zveme tě k dokončení nákupu tvé Fundly Challenge. Pozvánka je vázaná na ${email} — zaregistruj se se stejným e-mailem a pokladna se ti odemkne.`, btn: "Dokončit nákup" }
    : { h: "A spot just opened up", p: `You're invited to complete your Fundly Challenge purchase. This invite is tied to ${email} — sign up with the same e-mail to unlock checkout.`, btn: "Complete your purchase" };
  return `<div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">${t.h}</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 20px">${t.p}</p>
      <a href="${link}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">${t.btn}</a>
    </div>
  </div>`;
}

// „Payment confirmed" e-mail (whop-webhook): shrnutí nákupu + přístup do účtu. `accessLink`
// je buď magic link (žádné heslo nikdy nenastavené — viz findOrCreateUser),
// nebo obyčejný odkaz na dashboard (zákazník má heslo z checkout signupu).
// Obsahuje i potvrzení vzdání se 14denního práva na odstoupení na trvalém nosiči
// (souhlas z checkoutu, viz co.agreeCoolingHtml v js/i18n.js) + odkazy na podmínky a refund.
export function purchaseConfirmedHtml(
  pkg: { name: string; cap: number },
  accessLink: string,
  order: { id: string; amount: number; currency: string; promoCode: string | null; purchasedAt: Date },
  lang: string = "en",
  siteUrl: string = "https://fundly.games",
): string {
  const cs = isCs(lang);
  const locale = cs ? "cs-CZ" : "en-US";
  const termsUrl = `${siteUrl}/terms`;
  const refundUrl = `${siteUrl}/refund`;
  const lnk = (url: string) => `<a href="${url}" style="color:#7a7a86">${url}</a>`;
  const deadline = new Date(Date.now() + 30 * 86400000).toLocaleDateString(locale, {
    year: "numeric", month: "long", day: "numeric",
  });
  const purchasedAtStr = order.purchasedAt.toLocaleString(locale, {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
  // Skutečně zaplacená částka (po promo kódu) — NE katalogová cena z pkg,
  // ta by byla zavádějící kdykoliv zákazník použil slevový kód u Whopu.
  const amountStr = `${order.amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${order.currency}`;
  const capStr = pkg.cap.toLocaleString(locale);
  const t = cs
    ? {
      h: "Platba potvrzena",
      p: `Tvůj účet ${pkg.name} (${capStr} USD simulovaného kapitálu) je aktivní. Fáze 1 trvá 30 dní — termín: ${deadline}.`,
      btn: "Otevřít můj dashboard",
      ref: "Číslo objednávky", date: "Datum", pkg: "Balíček", promo: "Promo kód", paid: "Zaplacená částka",
      waiver: `<b style="color:#a0a0ab">Potvrzení nákupu:</b> zaplatil(a) jsi jednorázový poplatek za hodnocení Fundly Challenge. V pokladně jsi požádal(a) o okamžitý přístup k digitální službě a vzal(a) na vědomí, že přihlášením nebo podáním prvního simulačního tipu ztrácíš právo odstoupit od smlouvy do 14 dní. Vrácení celé částky do 14 dní od nákupu je možné jen tehdy, pokud účet nebyl použit. Obchodní podmínky: ${lnk(termsUrl)} · Vrácení peněz: ${lnk(refundUrl)}`,
      note: "Toto je potvrzení platby od Fundly, ne daňový doklad — Whop, náš zpracovatel plateb a prodejce (merchant of record) této transakce, ti oficiální účtenku pošle zvlášť na tuto e-mailovou adresu.",
    }
    : {
      h: "Payment confirmed",
      p: `Your ${pkg.name} account (${capStr} USD simulated capital) is active. Phase 1 runs 30 days — deadline ${deadline}.`,
      btn: "Open your dashboard",
      ref: "Order reference", date: "Date", pkg: "Package", promo: "Promo code", paid: "Amount paid",
      waiver: `<b style="color:#a0a0ab">Purchase confirmation:</b> you paid a one-time evaluation fee for the Fundly Challenge. At checkout you requested immediate access to the digital service and acknowledged that you lose your 14-day right of withdrawal once you log in or submit your first simulated tip. A full refund within 14 days of purchase is possible only if the account has not been used. Terms: ${lnk(termsUrl)} · Refund policy: ${lnk(refundUrl)}`,
      note: "This is a payment confirmation from Fundly, not a tax invoice — Whop, our payment processor and merchant of record for this transaction, sends its own official receipt separately to this same e-mail address.",
    };
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">${t.h}</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;margin:0 0 20px">${t.p}</p>
      <a href="${accessLink}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px">${t.btn}</a>

      <table style="width:100%;border-collapse:collapse;margin:24px 0 4px;font-size:13px">
        <tr><td style="color:#7a7a86;padding:5px 0">${t.ref}</td><td style="color:#e8e8ec;text-align:right;padding:5px 0">${order.id}</td></tr>
        <tr><td style="color:#7a7a86;padding:5px 0">${t.date}</td><td style="color:#e8e8ec;text-align:right;padding:5px 0">${purchasedAtStr}</td></tr>
        <tr><td style="color:#7a7a86;padding:5px 0">${t.pkg}</td><td style="color:#e8e8ec;text-align:right;padding:5px 0">${pkg.name}</td></tr>
        ${order.promoCode ? `<tr><td style="color:#7a7a86;padding:5px 0">${t.promo}</td><td style="color:#e8e8ec;text-align:right;padding:5px 0">${order.promoCode}</td></tr>` : ""}
        <tr><td style="color:#e8e8ec;font-weight:700;padding:9px 0 0;border-top:1px solid #ffffff1a">${t.paid}</td><td style="color:#14f195;font-weight:700;text-align:right;padding:9px 0 0;border-top:1px solid #ffffff1a">${amountStr}</td></tr>
      </table>

      <p style="color:#5a5a66;font-size:12px;line-height:1.6;margin:20px 0 0">${t.waiver}</p>
      <p style="color:#5a5a66;font-size:12px;line-height:1.6;margin:12px 0 0">${t.note}</p>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:20px 0" />
      ${footer("reply", lang)}
    </div>
  </div>`;
}
