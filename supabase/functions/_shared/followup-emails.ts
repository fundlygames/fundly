// _shared/followup-emails.ts — vizuální šablony týdenních follow-up e-mailů.
// Trasa A (nekoupili): A1/A2/A3, trasa B (spálený účet, speciální reset): B1/B2/B3.
// Jazyky: en + pl. Čisté funkce bez závislostí, ať jdou otestovat mimo Deno.
//
// Ceny se berou z PACKAGES (nikdy natvrdo) a stejně tak reset — jen sleva
// NEWFUNDLY (30 %) je tady konstanta, zrcadlí js/packages.js PROMO.percent.

import { PACKAGES, resetPrice } from "./packages.ts";

export type Lang = "en" | "pl";
export type Track = "A" | "B";

export interface FollowupContext {
  lang: Lang;
  siteUrl: string;
  unsubscribeUrl: string;
  // jen trasa B
  packageKey?: string;
  closedAt?: string | null; // ISO
  reason?: string | null;
}

const PROMO_PCT = 30;
const promo = (price: number) => Math.round(price * (1 - PROMO_PCT / 100));
const usd = (n: number) => "$" + n.toLocaleString("en-US");

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const C = {
  bg: "#020204", card: "#0d0d12", line: "#ffffff1a", text: "#c9c9d1", muted: "#7a7a86",
  white: "#ffffff", green: "#14f195", greenSoft: "#14f19522", greenLine: "#14f1954d", ink: "#020204",
  heroBg: "#0a1a14",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

interface Hero { label: string; value: string; was?: string; sub?: string; chip?: string }
interface Layout {
  ctx: FollowupContext;
  preheader: string;
  hero: Hero;
  greeting: string;
  paragraphs: string[]; // surové HTML (už escapované)
  bullets?: string[]; // surové HTML
  closedCard?: { title: string; sub: string } | null;
  cta: { label: string; url: string };
  secondary?: { label: string; url: string } | null;
  outro: string;
}

const FOOTER = {
  en: {
    why: "You're receiving this because you signed up at fundly.games. Fundly offers simulated accounts only, no real-money trading.",
    unsub: "Unsubscribe",
    team: "The Fundly team",
  },
  pl: {
    why: "Otrzymujesz tę wiadomość, ponieważ zapisał(a)ś się na fundly.games. Fundly oferuje wyłącznie konta symulowane, bez handlu prawdziwymi pieniędzmi.",
    unsub: "Wypisz się",
    team: "Zespół Fundly",
  },
};

function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto"><tr>
<td align="center" bgcolor="${C.green}" style="border-radius:12px;background:${C.green}">
<a href="${esc(url)}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${FONT};font-size:16px;font-weight:800;color:${C.ink};text-decoration:none;border-radius:12px">${esc(label)}</a>
</td></tr></table>`;
}

function layout(l: Layout): string {
  const f = FOOTER[l.ctx.lang];
  const h = l.hero;
  const bullets = (l.bullets ?? []).map((b) => `
<tr>
<td width="30" valign="top" style="padding:0 0 12px 0"><div style="width:22px;height:22px;line-height:22px;text-align:center;border-radius:11px;background:${C.greenSoft};color:${C.green};font-size:13px;font-weight:800;font-family:${FONT}">&#10003;</div></td>
<td valign="top" style="padding:0 0 12px 8px;font-family:${FONT};font-size:15px;line-height:1.55;color:${C.text}">${b}</td>
</tr>`).join("");
  const closed = l.closedCard
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr><td style="background:#ffffff08;border:1px solid ${C.line};border-radius:12px;padding:14px 18px;font-family:${FONT}">
<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${C.muted};margin-bottom:4px">${l.closedCard.title}</div>
<div style="font-size:14px;color:${C.text}">${l.closedCard.sub}</div></td></tr></table>`
    : "";
  const secondary = l.secondary
    ? `<div style="text-align:center;margin-top:14px;font-family:${FONT};font-size:14px"><a href="${esc(l.secondary.url)}" style="color:${C.green};text-decoration:underline">${esc(l.secondary.label)}</a></div>`
    : "";
  return `<!doctype html>
<html lang="${l.ctx.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Fundly</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(l.preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg}"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:${C.card};border:1px solid ${C.line};border-radius:20px">
<tr><td style="padding:26px 30px 0 30px;font-family:${FONT}">
  <span style="font-size:22px;font-weight:800;letter-spacing:-.02em;color:${C.green}">fundly</span>
</td></tr>
<tr><td style="padding:22px 30px 0 30px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${C.heroBg}" style="background:${C.heroBg};border:1px solid ${C.greenLine};border-radius:16px;padding:26px 18px;font-family:${FONT}">
    <div style="font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.muted}">${esc(h.label)}</div>
    <div style="font-size:46px;line-height:1.1;font-weight:800;letter-spacing:-.03em;color:${C.green};margin:8px 0 2px">${esc(h.value)}${h.was ? ` <span style="font-size:20px;font-weight:600;color:${C.muted};text-decoration:line-through;letter-spacing:0">${esc(h.was)}</span>` : ""}</div>
    ${h.chip ? `<div style="display:inline-block;margin:8px 0 2px;padding:6px 14px;border:1px dashed ${C.greenLine};border-radius:8px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:16px;font-weight:700;letter-spacing:.1em;color:${C.white}">${esc(h.chip)}</div>` : ""}
    ${h.sub ? `<div style="font-size:14px;color:${C.text};margin-top:8px">${esc(h.sub)}</div>` : ""}
  </td></tr></table>
</td></tr>
<tr><td style="padding:26px 30px 0 30px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.text}">
  <p style="margin:0 0 14px;font-size:17px;font-weight:700;color:${C.white}">${esc(l.greeting)}</p>
  ${closed}
  ${l.paragraphs.map((p) => `<p style="margin:0 0 14px">${p}</p>`).join("")}
  ${bullets ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 8px">${bullets}</table>` : ""}
</td></tr>
<tr><td style="padding:10px 30px 0 30px">${button(l.cta.label, l.cta.url)}${secondary}</td></tr>
<tr><td style="padding:26px 30px 0 30px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.text}">
  <p style="margin:0 0 4px">${l.outro}</p>
  <p style="margin:0;color:${C.white};font-weight:700">${esc(f.team)}</p>
</td></tr>
<tr><td style="padding:26px 30px 28px 30px"><div style="border-top:1px solid ${C.line};padding-top:16px;font-family:${FONT};font-size:11px;line-height:1.6;color:${C.muted}">
  ${esc(f.why)}<br>Grindit LLC &middot; Sharjah Media City, Sharjah, UAE &middot; Reg. 2541536<br>
  <a href="${esc(l.ctx.unsubscribeUrl)}" style="color:${C.muted};text-decoration:underline">${esc(f.unsub)}</a>
</div></td></tr>
</table></td></tr></table></body></html>`;
}

function b(s: string): string {
  return `<b style="color:${C.white}">${s}</b>`;
}

function fmtDate(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(lang === "pl" ? "pl-PL" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function renderFollowup(track: Track, step: number, ctx: FollowupContext): { subject: string; html: string } {
  const pl = ctx.lang === "pl";
  const site = ctx.siteUrl;
  const starter = PACKAGES.starter, standard = PACKAGES.standard, advanced = PACKAGES.advanced;

  if (track === "A") {
    if (step === 1) {
      const subject = pl ? "Twój kod -30% wciąż czeka" : "Your 30% code is still waiting";
      return { subject, html: layout({
        ctx,
        preheader: pl ? "Symulowany kapitał do $100 000. Maksymalnie tracisz opłatę." : "Simulated capital up to $100,000. The most you can lose is the fee.",
        hero: { label: pl ? "Twój kod" : "Your code", value: pl ? "-30%" : "30% OFF", chip: "NEWFUNDLY",
          sub: pl ? `Starter ${usd(promo(starter.price))} zamiast ${usd(starter.price)}` : `Starter ${usd(promo(starter.price))} instead of ${usd(starter.price)}` },
        greeting: pl ? "Cześć," : "Hi,",
        paragraphs: [pl ? "Oto Fundly w 30 sekund:" : "Here's the whole idea of Fundly in 30 seconds:"],
        bullets: pl ? [
          `Dajemy Ci ${b("symulowany kapitał")} (od $2 000 do $100 000), na którym udowodnisz swoje analizy sportowe`,
          `Zalicz dwie fazy (+10%, potem +5%, po 30 dni) i zostań ${b("Partnerem Fundly z 80% podziałem nagrody")}`,
          `Nigdy nie ryzykujesz własnego bankrolla: ${b("jednorazowa opłata to maksimum, jakie możesz stracić")}`,
        ] : [
          `We give you ${b("simulated capital")} ($2,000 up to $100,000) to prove your sports analysis`,
          `Pass two phases (+10%, then +5%, 30 days each) and become a ${b("Fundly Partner with an 80% performance split")}`,
          `You never risk your own bankroll: ${b("the one-time fee is the most you can lose")}`,
        ],
        cta: { label: pl ? "Zacznij Challenge" : "Start my Challenge", url: `${site}/get-started` },
        outro: pl ? "Masz pytania? Odpowiedz na tę wiadomość, czyta ją człowiek." : "Questions? Just reply to this email, a real person reads it.",
      }) };
    }
    if (step === 2) {
      const subject = pl ? "3 pytania, które zadaje każdy przed startem" : "The 3 questions everyone asks before starting";
      return { subject, html: layout({
        ctx,
        preheader: pl ? "Zasady, straty i wypłaty, prosto i szczerze." : "Rules, losses and payouts, answered straight.",
        hero: { label: pl ? "Starter od" : "Starter from", value: usd(promo(starter.price)), was: usd(starter.price),
          chip: "NEWFUNDLY", sub: pl ? "Najwięcej, co możesz stracić, to opłata" : "The most you can lose is the fee" },
        greeting: pl ? "Cześć," : "Hi,",
        paragraphs: [pl ? "Trzy pytania, które słyszymy najczęściej:" : "The three questions we hear the most:"],
        bullets: pl ? [
          `${b("Co, jeśli mi się nie uda?")} Tracisz tylko opłatę. Ten sam pakiet zrestartujesz za 40% jego ceny.`,
          `${b("Jakie są zasady?")} Maks. strata całkowita 10%, dzienna 4%, maks. stawka 1,5% kapitału, kursy 1.00–8.00. 30 dni na fazę, bez haczyków.`,
          `${b("Jak działają wypłaty?")} Po zakwalifikowaniu prosisz o wypłatę w podziale 80% po krótkiej weryfikacji tożsamości.`,
        ] : [
          `${b("What if I fail?")} You lose only the fee. Restart the same package for 40% of its price.`,
          `${b("What are the rules?")} Max total loss 10%, max daily loss 4%, max entry 1.5% of capital, odds 1.00–8.00. 30 days per phase, no hidden catches.`,
          `${b("How do payouts work?")} Once funded, you request payouts at an 80% split after a quick identity check.`,
        ],
        cta: { label: pl ? "Zacznij od " + usd(promo(starter.price)) : "Start from " + usd(promo(starter.price)), url: `${site}/get-started` },
        secondary: { label: pl ? "Najpierw zobacz darmowy podgląd" : "Or try the free preview first", url: `${site}/` },
        outro: pl ? "Każde pytanie? Odpowiedz na tę wiadomość." : "Any other question? Just reply to this email.",
      }) };
    }
    const subject = pl ? "Ostatni e-mail: 50% zniżki na Advanced" : "Our last email: 50% off Advanced";
    const half = Math.round(advanced.price / 2);
    return { subject, html: layout({
      ctx,
      preheader: pl ? `Symulowany kapitał $25 000 za ${usd(half)} zamiast ${usd(advanced.price)}.` : `$25,000 of simulated capital for ${usd(half)} instead of ${usd(advanced.price)}.`,
      hero: { label: pl ? "Ostatnia oferta" : "Last offer", value: pl ? "-50% Advanced" : "50% OFF Advanced", chip: "LAST50",
        sub: pl ? `${usd(half)} zamiast ${usd(advanced.price)}, kapitał $25 000` : `${usd(half)} instead of ${usd(advanced.price)}, $25,000 capital` },
      greeting: pl ? "Cześć," : "Hi,",
      paragraphs: pl ? [
        "Nie lubimy zasypywać skrzynek ofertami, więc to ostatnia wiadomość od nas.",
        `Jeśli wahała Cię cena, oto nasza najlepsza oferta: kod ${b("LAST50")} daje ${b("50% zniżki na pakiet Advanced")}.`,
        `Wolisz zacząć od małego? ${b("NEWFUNDLY")} wciąż daje Starter za ${b(usd(promo(starter.price)))}.`,
      ] : [
        "We don't like stuffing inboxes with promos, so this is the last one from us.",
        `If price was the hesitation, here's our best offer: code ${b("LAST50")} gives ${b("50% off the Advanced package")}.`,
        `Prefer to start small? ${b("NEWFUNDLY")} still gives you Starter for ${b(usd(promo(starter.price)))}.`,
      ],
      cta: { label: pl ? "Skorzystaj z oferty" : "Claim my offer", url: `${site}/get-started?package=advanced` },
      outro: pl ? "Powodzenia z typami." : "Good luck with your picks.",
    }) };
  }

  // ---------- trasa B: spálený účet, speciální reset ----------
  const pkg = PACKAGES[ctx.packageKey ?? "starter"] ?? starter;
  const reset = usd(resetPrice(pkg));
  const full = usd(pkg.price);
  const dashboard = `${site}/dashboard`;
  const closedDate = fmtDate(ctx.closedAt, ctx.lang);
  const reason = ctx.reason ? esc(ctx.reason) : "";
  const closedCard = {
    title: pl ? "Zamknięte konto" : "Closed account",
    sub: `${esc(pkg.name)} &middot; ${usd(pkg.cap)}${closedDate ? ` &middot; ${esc(closedDate)}` : ""}${reason ? `<br><span style="color:${C.muted}">${reason}</span>` : ""}`,
  };
  const resetHero = (label: string): Hero => ({
    label, value: reset, was: full,
    sub: pl ? "40% standardowej ceny, tylko dla zamkniętych kont" : "40% of the standard price, only for closed accounts",
  });

  if (step === 1) {
    return { subject: pl ? `Twój specjalny reset: ${reset} na restart pakietu ${pkg.name}` : `Your special reset: ${reset} to restart ${pkg.name}`,
      html: layout({
        ctx,
        preheader: pl ? "Tylko dla zamkniętych kont, 40% ceny pakietu." : "Only for closed accounts, 40% of the package price.",
        hero: resetHero(pl ? "Specjalny reset" : "Special reset"),
        greeting: pl ? "Cześć," : "Hi,",
        closedCard,
        paragraphs: pl ? [
          `Zdarza się. Dlatego przygotowaliśmy ${b("specjalny reset tylko dla zamkniętych kont")}: ${b(reset)} zamiast ${full}.`,
          "Ten sam pakiet, nowy start, te same zasady, bez kupowania nowej oceny od zera.",
          `Zaloguj się i kliknij ${b("Reset my account")}. Jeden reset na jedno zamknięte konto.`,
        ] : [
          `It happens. That's why we built a ${b("special reset just for closed accounts")}: ${b(reset)} instead of ${full}.`,
          "Same package, fresh start, same rules, no need to buy a new evaluation from scratch.",
          `Sign in and click ${b("Reset my account")}. One reset per closed account.`,
        ],
        cta: { label: pl ? `Skorzystaj z resetu, ${reset}` : `Use my special reset, ${reset}`, url: dashboard },
        outro: pl ? "Powodzenia w drugim podejściu." : "Good luck on your second run.",
      }) };
  }
  if (step === 2) {
    return { subject: pl ? `Twój reset (${reset}) + 3 nawyki, dzięki którym konto nr 2 przetrwa` : `Your reset (${reset}) + 3 habits to keep account #2 alive`,
      html: layout({
        ctx,
        preheader: pl ? "Restart za 40% ceny i unikaj tego, co zamyka większość kont." : "Restart for 40% of the price, and avoid what ends most accounts.",
        hero: resetHero(pl ? "Twój reset" : "Your reset"),
        greeting: pl ? "Cześć," : "Hi,",
        paragraphs: [pl ? `Twój specjalny reset nadal czeka: ${b(reset)} za nowe konto ${esc(pkg.name)}. Zanim wrócisz, trzy nawyki, które najczęściej kończą konta za wcześnie:`
          : `Your special reset is still available: ${b(reset)} for a fresh ${esc(pkg.name)} account. Before you restart, three habits that end most accounts early:`],
        bullets: pl ? [
          `${b("Wielkość stawki.")} Limit dzienny to 4%, a maks. stawka 1,5%, więc trzy maksymalne straty jednego dnia zamykają konto. Trzymaj stawki na 0,5–1%, dopóki nie jesteś na plusie.`,
          `${b("Długie akumulatory.")} Kupony z czterema zdarzeniami wyglądają świetnie i zwykle przegrywają. Single i dublety utrzymują Cię w grze.`,
          `${b("Odrabianie strat.")} Po złym dniu przestań. Limit dzienny resetuje się o północy UTC.`,
        ] : [
          `${b("Stake size.")} The daily limit is 4% and the max entry 1.5%, so three max-size losses in a day close you. Keep entries at 0.5–1% until you're ahead.`,
          `${b("Long accumulators.")} Four-leg parlays look great and usually lose. Singles and doubles keep you alive.`,
          `${b("Chasing.")} After a bad day, stop. The daily limit resets at midnight UTC.`,
        ],
        cta: { label: pl ? `Skorzystaj z resetu, ${reset}` : `Use my special reset, ${reset}`, url: dashboard },
        outro: pl ? "Do zobaczenia na drugiej stronie." : "See you on the other side.",
      }) };
  }
  return { subject: pl ? `Ostatnie przypomnienie: Twój specjalny reset, ${reset}` : `Last reminder: your special reset, ${reset}`,
    html: layout({
      ctx,
      preheader: pl ? `Restart ${pkg.name} za ${reset} albo większe konto z -30%.` : `Restart ${pkg.name} for ${reset}, or go bigger with 30% off.`,
      hero: resetHero(pl ? "Ostatnie przypomnienie" : "Last reminder"),
      greeting: pl ? "Cześć," : "Hi,",
      paragraphs: pl ? [
        `To nasze ostatnie przypomnienie o Twoim ${b("specjalnym resecie")}: ${b(reset)} na restart pakietu ${esc(pkg.name)}, ułamek ceny nowego zakupu. Reset pozostaje dostępny w Twoim panelu.`,
        `Chcesz tym razem większe konto? Kod ${b("NEWFUNDLY")} daje 30% zniżki na każdy pakiet, np. Standard ($10 000 symulowanego kapitału) za ${b(usd(promo(standard.price)))}.`,
      ] : [
        `This is our last reminder about your ${b("special reset")}: ${b(reset)} to restart ${esc(pkg.name)}, a fraction of a new purchase. It stays available in your dashboard.`,
        `Want a bigger account this time? ${b("NEWFUNDLY")} gives 30% off any package, for example Standard ($10,000 simulated) for ${b(usd(promo(standard.price)))}.`,
      ],
      cta: { label: pl ? `Skorzystaj z resetu, ${reset}` : `Use my special reset, ${reset}`, url: dashboard },
      secondary: { label: pl ? "Zobacz pakiety" : "See packages", url: `${site}/get-started` },
      outro: pl ? "Dziękujemy za zainteresowanie Fundly." : "Thanks for giving Fundly a try.",
    }) };
}
