// _shared/followup-emails.ts — vizuální šablony týdenních follow-up e-mailů.
// Trasa A (nekoupili): A1/A2/A3, trasa B (spálený účet, speciální reset): B1/B2/B3.
// Jazyky: en + pl + cs (cs i pro slovenské hráče, viz _shared/user-lang.ts).
// Čisté funkce bez závislostí na Deno, ať jdou otestovat mimo Deno.
//
// Ceny se berou z PACKAGES (nikdy natvrdo) a stejně tak reset — jen sleva
// NEWFUNDLY (30 %) je tady konstanta, zrcadlí js/packages.js PROMO.percent.

import { PACKAGES, resetPrice, priceIn, formatPrice, type PackageDef } from "./packages.ts";
import { localizeReason } from "./email.ts";

export type Lang = "en" | "pl" | "cs";
export type Track = "A" | "B" | "R";

export interface FollowupContext {
  lang: Lang;
  siteUrl: string;
  unsubscribeUrl: string;
  // trasa B (spálený balíček) a trasa R (balíček, který si vybrali v checkoutu)
  packageKey?: string;
  closedAt?: string | null; // ISO
  reason?: string | null;
}

const PROMO_PCT = 30;
const promo = (price: number) => Math.round(price * (1 - PROMO_PCT / 100));
// cs: "$25 000" (mezera jako oddělovač tisíců, jako na webu); en/pl beze změny "$25,000"
const usd = (n: number, lang?: Lang) => "$" + n.toLocaleString(lang === "cs" ? "cs-CZ" : "en-US");
// Ceny balíčků: český e-mail v Kč (jako český web, js/packages.js siteCurrency), jinak USD.
// Kapitál (cap) zůstává v USD přes usd().
const curOf = (lang?: Lang) => (lang === "cs" ? "czk" : "usd");
const pp = (pkg: PackageDef, lang?: Lang) => priceIn(pkg, curOf(lang)).price;

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
  cs: {
    why: "Tento e-mail dostáváš, protože ses zaregistroval(a) na fundly.games. Fundly nabízí výhradně simulované účty, nepracuje se se skutečnými penězi.",
    unsub: "Odhlásit odběr",
    team: "Tým Fundly",
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
  const locale = lang === "pl" ? "pl-PL" : lang === "cs" ? "cs-CZ" : "en-GB";
  return d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

// výběr textu podle jazyka: tr(en, pl, cs)
function pick(lang: Lang) {
  return <T>(en: T, pl: T, cs: T): T => (lang === "pl" ? pl : lang === "cs" ? cs : en);
}

export function renderFollowup(track: Track, step: number, ctx: FollowupContext): { subject: string; html: string } {
  const tr = pick(ctx.lang);
  const $ = (n: number) => usd(n, ctx.lang);
  const $p = (n: number) => formatPrice(n, curOf(ctx.lang));
  const site = ctx.siteUrl;
  const starter = PACKAGES.starter, standard = PACKAGES.standard, advanced = PACKAGES.advanced;

  if (track === "A") {
    if (step === 1) {
      const subject = tr("Your 30% code is still waiting", "Twój kod -30% wciąż czeka", "Tvůj kód na 30% slevu pořád čeká");
      return { subject, html: layout({
        ctx,
        preheader: tr("Simulated capital up to $100,000. The most you can lose is the fee.", "Symulowany kapitał do $100 000. Maksymalnie tracisz opłatę.", "Simulovaný kapitál až $100 000. Nejvíc můžeš přijít o poplatek."),
        hero: { label: tr("Your code", "Twój kod", "Tvůj kód"), value: tr("30% OFF", "-30%", "-30 %"), chip: "NEWFUNDLY",
          sub: tr(`Starter ${$p(promo(pp(starter, ctx.lang)))} instead of ${$p(pp(starter, ctx.lang))}`, `Starter ${$p(promo(pp(starter, ctx.lang)))} zamiast ${$p(pp(starter, ctx.lang))}`, `Starter za ${$p(promo(pp(starter, ctx.lang)))} místo ${$p(pp(starter, ctx.lang))}`) },
        greeting: tr("Hi,", "Cześć,", "Ahoj,"),
        paragraphs: [tr("Here's the whole idea of Fundly in 30 seconds:", "Oto Fundly w 30 sekund:", "Tady je celý princip Fundly za 30 sekund:")],
        bullets: tr([
          `We give you ${b("simulated capital")} ($2,000 up to $100,000) to prove your sports analysis`,
          `Pass two phases (+10%, then +5%, 30 days each) and become a ${b("Fundly Partner with an 80% performance split")}`,
          `You never risk your own bankroll: ${b("the one-time fee is the most you can lose")}`,
        ], [
          `Dajemy Ci ${b("symulowany kapitał")} (od $2 000 do $100 000), na którym udowodnisz swoje analizy sportowe`,
          `Zalicz dwie fazy (+10%, potem +5%, po 30 dni) i zostań ${b("Partnerem Fundly z 80% podziałem nagrody")}`,
          `Nigdy nie ryzykujesz własnego bankrolla: ${b("jednorazowa opłata to maksimum, jakie możesz stracić")}`,
        ], [
          `Dáme ti ${b("simulovaný kapitál")} (od $2 000 do $100 000), na kterém prokážeš svou sportovní analýzu`,
          `Projdi dvěma fázemi (+10 %, pak +5 %, každá 30 dní) a staň se ${b("Fundly Partnerem s 80% podílem z výkonu")}`,
          `Vlastní bankroll nikdy nenasazuješ: ${b("jednorázový poplatek je maximum, o které můžeš přijít")}`,
        ]),
        cta: { label: tr("Start my Challenge", "Zacznij Challenge", "Spustit Challenge"), url: `${site}/get-started` },
        outro: tr("Questions? Just reply to this email, a real person reads it.", "Masz pytania? Odpowiedz na tę wiadomość, czyta ją człowiek.", "Máš otázky? Stačí odpovědět na tento e-mail, čte ho skutečný člověk."),
      }) };
    }
    if (step === 2) {
      const subject = tr("The 3 questions everyone asks before starting", "3 pytania, które zadaje każdy przed startem", "3 otázky, které si před startem klade každý");
      return { subject, html: layout({
        ctx,
        preheader: tr("Rules, losses and rewards, answered straight.", "Zasady, straty i wypłaty, prosto i szczerze.", "Pravidla, ztráty a odměny, na rovinu."),
        hero: { label: tr("Starter from", "Starter od", "Starter od"), value: $p(promo(pp(starter, ctx.lang))), was: $p(pp(starter, ctx.lang)),
          chip: "NEWFUNDLY", sub: tr("The most you can lose is the fee", "Najwięcej, co możesz stracić, to opłata", "Nejvíc můžeš přijít o poplatek") },
        greeting: tr("Hi,", "Cześć,", "Ahoj,"),
        paragraphs: [tr("The three questions we hear the most:", "Trzy pytania, które słyszymy najczęściej:", "Tři otázky, které slýcháme nejčastěji:")],
        bullets: tr([
          `${b("What if I fail?")} You lose only the fee. Restart the same package for 40% of its price.`,
          `${b("What are the rules?")} Max total loss 10%, max daily loss 4%, max tip size 1.5% of capital, odds 1.00–8.00. 30 days per phase, no hidden catches.`,
          `${b("How do rewards work?")} Once you are a Fundly Partner, you request rewards at an 80% split after a quick identity check.`,
        ], [
          `${b("Co, jeśli mi się nie uda?")} Tracisz tylko opłatę. Ten sam pakiet zrestartujesz za 40% jego ceny.`,
          `${b("Jakie są zasady?")} Maks. strata całkowita 10%, dzienna 4%, maks. stawka 1,5% kapitału, kursy 1.00–8.00. 30 dni na fazę, bez haczyków.`,
          `${b("Jak działają wypłaty?")} Po zakwalifikowaniu prosisz o wypłatę w podziale 80% po krótkiej weryfikacji tożsamości.`,
        ], [
          `${b("Co když neuspěju?")} Přijdeš jen o poplatek. Stejný balíček pak restartuješ za 40 % jeho ceny.`,
          `${b("Jaká jsou pravidla?")} Max. celková ztráta 10 %, max. denní ztráta 4 %, max. velikost tipu 1,5 % kapitálu, kurzy 1.00–8.00. 30 dní na fázi, žádné skryté háčky.`,
          `${b("Jak fungují odměny?")} Jakmile máš účet Fundly Partner, žádáš o odměny s podílem 80 %, a to po rychlém ověření totožnosti.`,
        ]),
        cta: { label: tr("Start from ", "Zacznij od ", "Začít od ") + $p(promo(pp(starter, ctx.lang))), url: `${site}/get-started` },
        secondary: { label: tr("Or try the free preview first", "Najpierw zobacz darmowy podgląd", "Nebo si nejdřív vyzkoušej náhled zdarma"), url: `${site}/` },
        outro: tr("Any other question? Just reply to this email.", "Każde pytanie? Odpowiedz na tę wiadomość.", "Máš jinou otázku? Stačí odpovědět na tento e-mail."),
      }) };
    }
    const subject = tr("Our last email: 50% off Advanced", "Ostatni e-mail: 50% zniżki na Advanced", "Náš poslední e-mail: 50% sleva na Advanced");
    const half = Math.round(pp(advanced, ctx.lang) / 2);
    return { subject, html: layout({
      ctx,
      preheader: tr(`$25,000 of simulated capital for ${$p(half)} instead of ${$p(pp(advanced, ctx.lang))}.`, `Symulowany kapitał $25 000 za ${$p(half)} zamiast ${$p(pp(advanced, ctx.lang))}.`, `${$(advanced.cap)} simulovaného kapitálu za ${$p(half)} místo ${$p(pp(advanced, ctx.lang))}.`),
      hero: { label: tr("Last offer", "Ostatnia oferta", "Poslední nabídka"), value: tr("50% OFF Advanced", "-50% Advanced", "-50 % Advanced"), chip: "LAST50",
        sub: tr(`${$p(half)} instead of ${$p(pp(advanced, ctx.lang))}, $25,000 capital`, `${$p(half)} zamiast ${$p(pp(advanced, ctx.lang))}, kapitał $25 000`, `${$p(half)} místo ${$p(pp(advanced, ctx.lang))}, kapitál ${$(advanced.cap)}`) },
      greeting: tr("Hi,", "Cześć,", "Ahoj,"),
      paragraphs: tr([
        "We don't like stuffing inboxes with promos, so this is the last one from us.",
        `If price was the hesitation, here's our best offer: code ${b("LAST50")} gives ${b("50% off the Advanced package")}.`,
        `Prefer to start small? ${b("NEWFUNDLY")} still gives you Starter for ${b($p(promo(pp(starter, ctx.lang))))}.`,
      ], [
        "Nie lubimy zasypywać skrzynek ofertami, więc to ostatnia wiadomość od nas.",
        `Jeśli wahała Cię cena, oto nasza najlepsza oferta: kod ${b("LAST50")} daje ${b("50% zniżki na pakiet Advanced")}.`,
        `Wolisz zacząć od małego? ${b("NEWFUNDLY")} wciąż daje Starter za ${b($p(promo(pp(starter, ctx.lang))))}.`,
      ], [
        "Nemáme rádi zahlcené schránky, takže tohle je od nás poslední nabídka.",
        `Pokud tě brzdila cena, tady je naše nejlepší nabídka: kód ${b("LAST50")} ti dává ${b("50% slevu na balíček Advanced")}.`,
        `Chceš začít s menším? ${b("NEWFUNDLY")} ti pořád dává Starter za ${b($p(promo(pp(starter, ctx.lang))))}.`,
      ]),
      cta: { label: tr("Claim my offer", "Skorzystaj z oferty", "Využít nabídku"), url: `${site}/get-started?package=advanced` },
      outro: tr("Good luck with your picks.", "Powodzenia z typami.", "Hodně štěstí s tipy."),
    }) };
  }

  // ---------- trasa B: spálený účet, speciální reset ----------
  const pkg = PACKAGES[ctx.packageKey ?? "starter"] ?? starter;
  const reset = $p(resetPrice(pkg, curOf(ctx.lang)));
  const full = $p(pp(pkg, ctx.lang));
  const dashboard = `${site}/dashboard`;
  const closedDate = fmtDate(ctx.closedAt, ctx.lang);
  const reason = ctx.reason ? esc(localizeReason(ctx.reason, ctx.lang)) : "";
  const closedCard = {
    title: tr("Closed account", "Zamknięte konto", "Uzavřený účet"),
    sub: `${esc(pkg.name)} &middot; ${$(pkg.cap)}${closedDate ? ` &middot; ${esc(closedDate)}` : ""}${reason ? `<br><span style="color:${C.muted}">${reason}</span>` : ""}`,
  };
  const resetHero = (label: string): Hero => ({
    label, value: reset, was: full,
    sub: tr("40% of the standard price, only for closed accounts", "40% standardowej ceny, tylko dla zamkniętych kont", "40 % standardní ceny, jen pro uzavřené účty"),
  });
  const resetCta = tr(`Use my special reset, ${reset}`, `Skorzystaj z resetu, ${reset}`, `Využít speciální reset, ${reset}`);

  if (step === 1) {
    return { subject: tr(`Your special reset: ${reset} to restart ${pkg.name}`, `Twój specjalny reset: ${reset} na restart pakietu ${pkg.name}`, `Tvůj speciální reset: ${reset} za restart balíčku ${pkg.name}`),
      html: layout({
        ctx,
        preheader: tr("Only for closed accounts, 40% of the package price.", "Tylko dla zamkniętych kont, 40% ceny pakietu.", "Jen pro uzavřené účty, 40 % ceny balíčku."),
        hero: resetHero(tr("Special reset", "Specjalny reset", "Speciální reset")),
        greeting: tr("Hi,", "Cześć,", "Ahoj,"),
        closedCard,
        paragraphs: tr([
          `It happens. That's why we built a ${b("special reset just for closed accounts")}: ${b(reset)} instead of ${full}.`,
          "Same package, fresh start, same rules, no need to buy a new evaluation from scratch.",
          `Sign in and click ${b("Reset my account")}. One reset per closed account.`,
        ], [
          `Zdarza się. Dlatego przygotowaliśmy ${b("specjalny reset tylko dla zamkniętych kont")}: ${b(reset)} zamiast ${full}.`,
          "Ten sam pakiet, nowy start, te same zasady, bez kupowania nowej oceny od zera.",
          `Zaloguj się i kliknij ${b("Reset my account")}. Jeden reset na jedno zamknięte konto.`,
        ], [
          `Stává se to. Proto jsme připravili ${b("speciální reset jen pro uzavřené účty")}: ${b(reset)} místo ${full}.`,
          "Stejný balíček, nový start, stejná pravidla a žádné kupování nového hodnocení od nuly.",
          `Přihlas se a klikni na ${b("Resetovat můj účet")}. Jeden reset na každý uzavřený účet.`,
        ]),
        cta: { label: resetCta, url: dashboard },
        outro: tr("Good luck on your second run.", "Powodzenia w drugim podejściu.", "Hodně štěstí při druhém pokusu."),
      }) };
  }
  if (step === 2) {
    return { subject: tr(`Your reset (${reset}) + 3 habits to keep account #2 alive`, `Twój reset (${reset}) + 3 nawyki, dzięki którym konto nr 2 przetrwa`, `Tvůj reset (${reset}) + 3 návyky, díky kterým účet č. 2 vydrží`),
      html: layout({
        ctx,
        preheader: tr("Restart for 40% of the price, and avoid what ends most accounts.", "Restart za 40% ceny i unikaj tego, co zamyka większość kont.", "Restart za 40 % ceny a jak se vyhnout tomu, co uzavře většinu účtů."),
        hero: resetHero(tr("Your reset", "Twój reset", "Tvůj reset")),
        greeting: tr("Hi,", "Cześć,", "Ahoj,"),
        paragraphs: [tr(
          `Your special reset is still available: ${b(reset)} for a fresh ${esc(pkg.name)} account. Before you restart, three habits that end most accounts early:`,
          `Twój specjalny reset nadal czeka: ${b(reset)} za nowe konto ${esc(pkg.name)}. Zanim wrócisz, trzy nawyki, które najczęściej kończą konta za wcześnie:`,
          `Tvůj speciální reset je pořád k dispozici: ${b(reset)} za nový účet ${esc(pkg.name)}. Než začneš znovu, tady jsou tři návyky, kvůli kterým většina účtů skončí předčasně:`,
        )],
        bullets: tr([
          `${b("Tip size.")} The daily limit is 4% and the max tip size 1.5%, so three max-size losing tips in a day close you. Keep tips at 0.5–1% until you're ahead.`,
          `${b("Long combos.")} Tips with four selections look great and usually lose. Tips with one or two selections keep you alive.`,
          `${b("Chasing.")} After a bad day, stop. The daily limit resets at midnight UTC.`,
        ], [
          `${b("Wielkość stawki.")} Limit dzienny to 4%, a maks. stawka 1,5%, więc trzy maksymalne straty jednego dnia zamykają konto. Trzymaj stawki na 0,5–1%, dopóki nie jesteś na plusie.`,
          `${b("Długie akumulatory.")} Kupony z czterema zdarzeniami wyglądają świetnie i zwykle przegrywają. Single i dublety utrzymują Cię w grze.`,
          `${b("Odrabianie strat.")} Po złym dniu przestań. Limit dzienny resetuje się o północy UTC.`,
        ], [
          `${b("Velikost tipu.")} Denní limit je 4 % a max. velikost tipu 1,5 %, takže tři prohrané tipy v maximální výši za jeden den účet uzavřou. Dokud nejsi v plusu, drž tipy na 0,5–1 % kapitálu.`,
          `${b("Dlouhé kombinace.")} Tipy se čtyřmi volbami vypadají lákavě, ale většinou prohrají. Tipy s jednou nebo dvěma volbami tě udrží ve hře.`,
          `${b("Honění ztrát.")} Po špatném dni přestaň. Denní limit se resetuje o půlnoci UTC.`,
        ]),
        cta: { label: resetCta, url: dashboard },
        outro: tr("See you on the other side.", "Do zobaczenia na drugiej stronie.", "Držíme palce."),
      }) };
  }
  return { subject: tr(`Last reminder: your special reset, ${reset}`, `Ostatnie przypomnienie: Twój specjalny reset, ${reset}`, `Poslední připomínka: tvůj speciální reset, ${reset}`),
    html: layout({
      ctx,
      preheader: tr(`Restart ${pkg.name} for ${reset}, or go bigger with 30% off.`, `Restart ${pkg.name} za ${reset} albo większe konto z -30%.`, `Restartuj ${pkg.name} za ${reset}, nebo zkus větší účet s 30% slevou.`),
      hero: resetHero(tr("Last reminder", "Ostatnie przypomnienie", "Poslední připomínka")),
      greeting: tr("Hi,", "Cześć,", "Ahoj,"),
      paragraphs: tr([
        `This is our last reminder about your ${b("special reset")}: ${b(reset)} to restart ${esc(pkg.name)}, a fraction of a new purchase. It stays available in your dashboard.`,
        `Want a bigger account this time? ${b("NEWFUNDLY")} gives 30% off any package, for example Standard ($10,000 simulated) for ${b($p(promo(pp(standard, ctx.lang))))}.`,
      ], [
        `To nasze ostatnie przypomnienie o Twoim ${b("specjalnym resecie")}: ${b(reset)} na restart pakietu ${esc(pkg.name)}, ułamek ceny nowego zakupu. Reset pozostaje dostępny w Twoim panelu.`,
        `Chcesz tym razem większe konto? Kod ${b("NEWFUNDLY")} daje 30% zniżki na każdy pakiet, np. Standard ($10 000 symulowanego kapitału) za ${b($p(promo(pp(standard, ctx.lang))))}.`,
      ], [
        `Tohle je naše poslední připomínka tvého ${b("speciálního resetu")}: ${b(reset)} za restart balíčku ${esc(pkg.name)}, zlomek ceny nového nákupu. V dashboardu ti zůstává k dispozici.`,
        `Chceš tentokrát větší účet? Kód ${b("NEWFUNDLY")} ti dává 30% slevu na jakýkoli balíček, například Standard (${$(standard.cap)} simulovaného kapitálu) za ${b($p(promo(pp(standard, ctx.lang))))}.`,
      ]),
      cta: { label: resetCta, url: dashboard },
      secondary: { label: tr("See packages", "Zobacz pakiety", "Zobrazit balíčky"), url: `${site}/get-started` },
      outro: tr("Thanks for giving Fundly a try.", "Dziękujemy za zainteresowanie Fundly.", "Díky, že jsi Fundly dal(a) šanci."),
    }) };
}


// ---------------------------------------------------------------------------
// Trasa R — "cart recovery": registrace v checkoutu, platba nedokončena.
// Jeden e-mail 45 min až 48 h po registraci. Sleva NEWFUNDLY se v platebním
// formuláři uplatňuje automaticky (viz js/checkout.js), proto ji tu netřeba
// opisovat — jen ji zmiňujeme jako už započtenou.
// ---------------------------------------------------------------------------
export function renderRecovery(ctx: FollowupContext): { subject: string; html: string } {
  const tr = pick(ctx.lang);
  const $ = (n: number) => usd(n, ctx.lang);
  const $p = (n: number) => formatPrice(n, curOf(ctx.lang));
  const site = ctx.siteUrl;
  const pkg = PACKAGES[ctx.packageKey ?? ""] ?? PACKAGES.starter;
  const price = promo(pp(pkg, ctx.lang));
  const langParam = ctx.lang === "pl" || ctx.lang === "cs" ? `&lang=${ctx.lang}` : "";
  const link = `${site}/checkout?package=${encodeURIComponent(pkg.key)}&utm_source=email&utm_medium=recovery&utm_campaign=cart${langParam}`;
  const subject = tr(
    `Your Fundly order is waiting (30% off already applied)`,
    `Twoje zamówienie w Fundly czeka (zniżka -30% już naliczona)`,
    `Tvoje objednávka ve Fundly čeká (30% sleva už je započtená)`,
  );
  return { subject, html: layout({
    ctx,
    preheader: tr(`Your payment wasn't completed, nothing has been charged.`, `Płatność nie została dokończona, nic nie zostało pobrane.`, `Platba nebyla dokončena, nic ti nebylo strženo.`),
    hero: { label: tr("Your order", "Twoje zamówienie", "Tvoje objednávka"), value: $p(price), was: $p(pp(pkg, ctx.lang)),
      chip: "NEWFUNDLY", sub: tr(
        `${pkg.name} · $${pkg.cap.toLocaleString("en-US")} of simulated capital`,
        `${pkg.name} · $${pkg.cap.toLocaleString("en-US")} symulowanego kapitału`,
        `${pkg.name} · ${$(pkg.cap)} simulovaného kapitálu`,
      ) },
    greeting: tr("Hi,", "Cześć,", "Ahoj,"),
    paragraphs: tr([
      `You created a Fundly account but the payment wasn't completed. ${b("Nothing has been charged")}, and your 30% discount is applied automatically: no code to type.`,
      `One click takes you straight back to the payment.`,
    ], [
      `Założyłeś(-aś) konto w Fundly, ale płatność nie została dokończona. ${b("Nic nie zostało pobrane")}, a Twoja zniżka -30% jest naliczana automatycznie: nie musisz niczego wpisywać.`,
      `Wystarczy jedno kliknięcie, żeby wrócić do płatności.`,
    ], [
      `Založil(a) sis účet ve Fundly, ale platba nebyla dokončena. ${b("Nic ti nebylo strženo")} a tvoje 30% sleva se uplatní automaticky: nemusíš zadávat žádný kód.`,
      `Jedním kliknutím se vrátíš rovnou k platbě.`,
    ]),
    bullets: tr([
      `${b("One-time fee")}, no subscription, no hidden costs. It's the most you can lose.`,
      `Payment not loading inside the Facebook or Instagram app? This link opens in your normal browser, where it works best.`,
    ], [
      `${b("Jednorazowa opłata")}, bez subskrypcji i bez ukrytych kosztów. To maksimum, jakie możesz stracić.`,
      `Płatność nie ładuje się w aplikacji Facebooka lub Instagrama? Ten link otworzy się w zwykłej przeglądarce, gdzie działa najlepiej.`,
    ], [
      `${b("Jednorázový poplatek")}, žádné předplatné, žádné skryté náklady. Víc než tuto částku nikdy neztratíš.`,
      `Platba se ti nenačítá v aplikaci Facebooku nebo Instagramu? Tento odkaz se otevře v běžném prohlížeči, kde funguje nejlépe.`,
    ]),
    cta: { label: tr(`Complete my order for ${$p(price)}`, `Dokończ zamówienie za ${$p(price)}`, `Dokončit objednávku za ${$p(price)}`), url: link },
    outro: tr(
      `Something didn't work, or have a question? ${b("Just reply to this email")}: a real person reads it and we'll sort it out.`,
      `Coś nie działało albo masz pytanie? ${b("Odpowiedz na tę wiadomość")}: czyta ją człowiek i to naprawimy.`,
      `Něco nefungovalo, nebo máš otázku? ${b("Stačí odpovědět na tento e-mail")}: čte ho skutečný člověk a vyřešíme to.`,
    ),
  }) };
}
