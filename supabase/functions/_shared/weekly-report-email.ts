// _shared/weekly-report-email.ts — šablona týdenního e-mailu s analýzou tipů (funkce weekly-report).
// Stejný tmavý vzhled jako šablony v _shared/email.ts. Bez závislostí na Deno (jde vyrenderovat
// v node --experimental-strip-types). Jazyk: "cs" (i pro sk) nebo cokoli jiného = anglicky.
// Slovník (cs): tip/tipy, odměna, vklad — nikdy "tiket", "výplata", "sázka", "výhra".
import { BAND_LABELS, type Segment, type WeeklyStats } from "./weekly-report-stats.ts";
import type { MonthlyRecap } from "./monthly-recap.ts";

const OPERATOR = "Fundly s.r.o. · Čenětická 2413/1a, 149 00 Praha 4, Czech Republic · IČO 30237246";
const isCs = (lang?: string | null) => lang === "cs";
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const SPORTS: Record<string, [string, string]> = {
  basketball: ["Basketball", "Basketbal"], football: ["Football", "Fotbal"], "ice-hockey": ["Hockey", "Hokej"],
  esports: ["Esports", "Esporty"], "table-tennis": ["Table tennis", "Stolní tenis"], tennis: ["Tennis", "Tenis"],
  darts: ["Darts", "Šipky"], baseball: ["Baseball", "Baseball"], "mixed-martial-arts": ["MMA", "MMA"],
  wrestling: ["Wrestling", "Wrestling"], "american-football": ["American football", "Americký fotbal"],
};
const MARKETS: Record<string, [string, string]> = {
  "ML": ["Match winner", "Vítěz zápasu"], "Draw No Bet": ["Draw no bet", "Bez remízy"],
  "Double Chance": ["Double chance", "Dvojitá šance"], "Spread": ["Asian handicap", "Asijský handicap"],
  "European Handicap": ["European handicap", "Evropský handicap"], "Totals": ["Total points (over / under)", "Počet bodů (více / méně)"],
  "Goals Over/Under": ["Goals (over / under)", "Počet gólů (více / méně)"], "Both Teams To Score": ["Both teams to score", "Oba týmy skórují"],
  "Spread HT": ["Handicap · 1st half", "Handicap · 1. poločas"], "Totals HT": ["Total · 1st half", "Počet gólů/bodů · 1. poločas"],
  "ML HT": ["Winner · 1st half", "Vítěz · 1. poločas"], "Half Time Result": ["Winner · 1st half", "Vítěz · 1. poločas"],
  "Odd/Even": ["Total goals odd / even", "Počet gólů lichý / sudý"],
};
const WEEKDAYS_EN = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const WEEKDAYS_CS = ["V pondělí", "V úterý", "Ve středu", "Ve čtvrtek", "V pátek", "V sobotu", "V neděli"];

function pct(ratio: number, lang: string, signed = true, digits = 0): string {
  const v = ratio * 100;
  const r = Number(v.toFixed(digits));
  const abs = Math.abs(r).toFixed(digits);
  const shown = isCs(lang) ? abs.replace(".", ",") : abs;
  const sign = !signed ? "" : r > 0 ? "+" : r < 0 ? "−" : "";
  return `${sign}${shown}${isCs(lang) ? " %" : "%"}`;
}
function money(n: number, lang: string, signed = false): string {
  const v = Math.round(n);
  const sign = signed ? (v > 0 ? "+" : v < 0 ? "−" : "") : (v < 0 ? "−" : "");
  return `${sign}$${Math.abs(v).toLocaleString(isCs(lang) ? "cs-CZ" : "en-US")}`;
}
function tipsWord(n: number, lang: string): string {
  if (!isCs(lang)) return n === 1 ? "tip" : "tips";
  return n === 1 ? "tip" : n >= 2 && n <= 4 ? "tipy" : "tipů";
}
/** "9.–15. 11. 2026" / "9 Nov – 15 Nov 2026" (UTC). Období končí v pondělí ráno (cron 07:00),
 *  takže jako poslední den se ukazuje neděle (toMs − 1 den). */
export function periodLabel(fromMs: number, toMs: number, lang: string): string {
  const a = new Date(fromMs), b = new Date(Math.max(fromMs, toMs - 86400000));
  if (isCs(lang)) {
    const same = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
    return same
      ? `${a.getUTCDate()}.–${b.getUTCDate()}. ${b.getUTCMonth() + 1}. ${b.getUTCFullYear()}`
      : `${a.getUTCDate()}. ${a.getUTCMonth() + 1}. – ${b.getUTCDate()}. ${b.getUTCMonth() + 1}. ${b.getUTCFullYear()}`;
  }
  const f = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${f(a)} – ${f(b)} ${b.getUTCFullYear()}`;
}

function segPhrase(s: Segment, lang: string): string {
  const cs = isCs(lang);
  switch (s.dim) {
    case "band": return BAND_LABELS[s.key] ?? s.key;
    case "sport": return (SPORTS[s.key]?.[cs ? 1 : 0]) ?? s.key;
    case "market": return (MARKETS[s.key]?.[cs ? 1 : 0]) ?? s.key;
    case "type": return s.key === "combo" ? (cs ? "kombinací" : "combos") : (cs ? "single tipů" : "singles");
    case "weekday": return (cs ? WEEKDAYS_CS : WEEKDAYS_EN)[Number(s.key)] ?? s.key;
    default: return s.key;
  }
}

function segSentence(s: Segment, kind: "best" | "worst", lang: string): string {
  const seg = `<b style="color:#e8e8ec">${esc(segPhrase(s, lang))}</b>`;
  const roi = `<b style="color:${s.roi >= 0 ? "#14f195" : "#ff9d9d"}">${pct(s.roi, lang)}</b>`;
  const n = `${s.n} ${tipsWord(s.n, lang)}`;
  if (isCs(lang)) {
    const pre: Record<string, string> = {
      band: `Na kurzech ${seg}`, sport: `Ve sportu ${seg}`, league: `V soutěži ${seg}`,
      market: `Na trhu ${seg}`, type: `U ${seg}`, weekday: seg,
    };
    return kind === "worst"
      ? `${pre[s.dim]} máš ROI ${roi} z ${n} — zvaž menší vklady nebo se tomu vyhni.`
      : `${pre[s.dim]} máš ROI ${roi} z ${n} — tady ti to jde.`;
  }
  const pre: Record<string, string> = {
    band: `On odds ${seg}`, sport: `In ${seg}`, league: `In ${seg}`,
    market: `On the ${seg} market`, type: `With ${seg}`, weekday: `On ${seg}`,
  };
  return kind === "worst"
    ? `${pre[s.dim]} your ROI was ${roi} over ${n} — consider smaller entries or skipping these.`
    : `${pre[s.dim]} your ROI was ${roi} over ${n} — this works for you.`;
}

function disciplineSentence(st: WeeklyStats, lang: string): string {
  const d = st.discipline, cs = isCs(lang);
  const avg = d.avgPct === null ? "" : (cs
    ? ` Průměrný vklad: ${pct(d.avgPct / 100, lang, false, 2)} kapitálu.`
    : ` Average entry: ${pct(d.avgPct / 100, lang, false, 2)} of capital.`);
  switch (d.note.kind) {
    case "chasing": return cs
      ? `Po prohraném tipu jsi dával(a) v průměru o ${pct(d.note.value!, lang, false)} větší vklad než po úspěšném — pozor na dohánění ztrát.${avg}`
      : `After a lost tip your entry was on average ${pct(d.note.value!, lang, false)} bigger than after a successful one — watch out for chasing losses.${avg}`;
    case "above1": return cs
      ? `${pct(d.note.value!, lang, false)} tipů mělo vklad nad 1 % kapitálu. Stálé vklady 0,5–1 % tě drží daleko od limitu ztráty.${avg}`
      : `${pct(d.note.value!, lang, false)} of your tips were above 1% of capital. Consistent entries of 0.5–1% keep you far from the loss limit.${avg}`;
    case "uneven": return cs
      ? `Výše vkladů ti hodně kolísala. Stálý vklad ti usnadní čtení výsledků.${avg}`
      : `Your entry sizes varied a lot. A steady size makes your results easier to read.${avg}`;
    case "few": return cs
      ? `Tenhle týden jen pár tipů — na hodnocení disciplíny je to málo.${avg}`
      : `Only a few tips this week — not enough to judge entry discipline.${avg}`;
    default: return cs
      ? `Vklady jsi držel(a) stálé a rozumné — jen tak dál.${avg}`
      : `Your entries were steady and sensible — keep it that way.${avg}`;
  }
}

export interface WeeklyReportParams {
  pkgName: string;
  /** 1, 2 = fáze challenge; 3 = partner (funded) účet */
  phase: number;
  stats: WeeklyStats;
  fromMs: number;
  toMs: number;
  /** postup k cíli fáze (jen fáze 1/2): zisk fáze z tipů a cíl v $ */
  progress: { profit: number; target: number } | null;
  dashboardLink: string;
  unsubscribeLink: string;
  /** měsíční přehled (první e-mail v měsíci) — viz _shared/monthly-recap.ts */
  monthly?: MonthlyRecap | null;
  /** odkaz na dashboard#month */
  monthLink?: string;
}

const MONTHS_CS = ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
/** "říjen" / "October" z klíče "YYYY-MM" */
export function monthLabel(key: string, lang: string): string {
  const [y, m] = key.split("-").map(Number);
  if (isCs(lang)) return MONTHS_CS[m - 1] ?? key;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
}

/** blok „Tvůj měsíc" — tipy, úspěšnost, ROI, výsledek, nejlepší sport a tip, kde ztrácel(a), srovnání */
function monthlyHtml(r: MonthlyRecap, link: string, lang: string): string {
  const cs = isCs(lang);
  const st = r.cur;
  const green = "#14f195", red = "#ff9d9d", muted = "#a0a0ab";
  const colorOf = (v: number) => (v > 0 ? green : v < 0 ? red : "#e8e8ec");
  const name = monthLabel(r.key, lang);
  const title = cs ? `Tvůj ${name} ve Fundly` : `Your ${name} on Fundly`;
  const mini = (label: string, value: string, color = "#e8e8ec") => `
          <td width="25%" style="padding:4px;vertical-align:top;text-align:center">
            <div style="color:${color};font-size:17px;font-weight:700">${value}</div>
            <div style="color:#7a7a86;font-size:10px;text-transform:uppercase;letter-spacing:.04em;margin-top:2px">${label}</div>
          </td>`;
  const profit = st.profitPctOfCap === null ? "–" : pct(st.profitPctOfCap / 100, lang, true, 1);
  const lines: string[] = [];
  if (r.bestSport) {
    const sp = segPhrase(r.bestSport, lang);
    lines.push(cs
      ? `Nejlepší sport: <b style="color:#e8e8ec">${esc(sp)}</b> — ROI ${pct(r.bestSport.roi, lang)} z ${r.bestSport.n} ${tipsWord(r.bestSport.n, lang)}.`
      : `Best sport: <b style="color:#e8e8ec">${esc(sp)}</b> — ROI ${pct(r.bestSport.roi, lang)} from ${r.bestSport.n} ${tipsWord(r.bestSport.n, lang)}.`);
  }
  if (r.bestTip) {
    const what = r.bestTip.match.startsWith("×") ? (cs ? `kombinace ${r.bestTip.match}` : `combo ${r.bestTip.match}`) : r.bestTip.match;
    const odds = r.bestTip.odds > 0 ? (cs ? `, kurz ${r.bestTip.odds.toFixed(2).replace(".", ",")}` : `, odds ${r.bestTip.odds.toFixed(2)}`) : "";
    lines.push(cs
      ? `Nejlepší tip: <b style="color:#e8e8ec">${esc(what)}</b>${r.bestTip.pick ? ` (${esc(r.bestTip.pick)})` : ""}${odds} — <b style="color:${green}">${money(r.bestTip.net, lang, true)}</b>.`
      : `Best tip: <b style="color:#e8e8ec">${esc(what)}</b>${r.bestTip.pick ? ` (${esc(r.bestTip.pick)})` : ""}${odds} — <b style="color:${green}">${money(r.bestTip.net, lang, true)}</b>.`);
  }
  if (st.worst) lines.push(segSentence(st.worst, "worst", lang));
  if (r.prev) {
    const prevName = monthLabel(
      (() => { const [y, m] = r.key.split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; })(),
      lang,
    );
    const pp = (v: number) => {
      const r1 = Math.round(v * 1000) / 10;
      const shown = Math.abs(r1).toFixed(1);
      return `<b style="color:${colorOf(r1)}">${r1 > 0 ? "+" : r1 < 0 ? "−" : ""}${cs ? shown.replace(".", ",") + " p. b." : shown + " pp"}</b>`;
    };
    const wr = st.winRate !== null && r.prev.winRate !== null ? st.winRate - r.prev.winRate : null;
    lines.push(cs
      ? `Oproti předchozímu měsíci (${prevName}): ROI ${pp(st.roi - r.prev.roi)}${wr !== null ? `, úspěšnost ${pp(wr)}` : ""}.`
      : `Compared with ${prevName}: ROI ${pp(st.roi - r.prev.roi)}${wr !== null ? `, win rate ${pp(wr)}` : ""}.`);
  }
  return `
      <div style="border:1px solid #14f19540;background:#0f1a15;border-radius:12px;padding:16px;margin:6px 0 14px">
        <div style="color:${green};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">${cs ? "Měsíční přehled" : "Monthly recap"}</div>
        <div style="color:#fff;font-size:17px;font-weight:700;margin-bottom:10px">${esc(title)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 10px">
          <tr>
            ${mini(cs ? "Tipy" : "Tips", String(st.tips))}
            ${mini(cs ? "Úspěšnost" : "Win rate", st.winRate === null ? "–" : pct(st.winRate, lang, false))}
            ${mini("ROI", pct(st.roi, lang), colorOf(st.roi))}
            ${mini(cs ? "Z kapitálu" : "Of capital", profit, colorOf(st.net))}
          </tr>
        </table>
        ${lines.map((l) => `<p style="color:${muted};font-size:13px;line-height:1.6;margin:0 0 6px">${l}</p>`).join("")}
        <a href="${esc(link)}" style="display:inline-block;color:${green};font-weight:700;font-size:13px;text-decoration:none;margin-top:6px">${cs ? "Zobrazit a sdílet můj měsíc →" : "View and share my month →"}</a>
      </div>`;
}

export function weeklyReportSubject(st: WeeklyStats, lang: string, monthly?: MonthlyRecap | null): string {
  if (monthly) {
    const name = monthLabel(monthly.key, lang);
    return isCs(lang)
      ? `Tvůj ${name} ve Fundly: ROI ${pct(monthly.cur.roi, lang)}, ${monthly.cur.tips} ${tipsWord(monthly.cur.tips, lang)} + týdenní přehled`
      : `Your ${name} on Fundly: ROI ${pct(monthly.cur.roi, lang)}, ${monthly.cur.tips} ${tipsWord(monthly.cur.tips, lang)} + weekly report`;
  }
  return isCs(lang)
    ? `Tvůj týden ve Fundly: ROI ${pct(st.roi, lang)}, ${st.tips} ${tipsWord(st.tips, lang)}`
    : `Your Fundly week: ROI ${pct(st.roi, lang)}, ${st.tips} ${tipsWord(st.tips, lang)}`;
}

export function weeklyReportHtml(p: WeeklyReportParams, lang: string = "en"): string {
  const cs = isCs(lang);
  const st = p.stats;
  const phaseLabel = p.phase >= 3 ? (cs ? "Partner účet" : "Partner account") : (cs ? `Fáze ${p.phase}` : `Phase ${p.phase}`);
  const green = "#14f195", red = "#ff9d9d", muted = "#a0a0ab";
  const colorOf = (v: number) => (v > 0 ? green : v < 0 ? red : "#e8e8ec");

  const cell = (label: string, value: string, color = "#e8e8ec", sub = "") => `
        <td width="50%" style="padding:6px;vertical-align:top">
          <div style="background:#121219;border:1px solid #ffffff14;border-radius:10px;padding:12px 14px">
            <div style="color:#7a7a86;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">${label}</div>
            <div style="color:${color};font-size:20px;font-weight:700">${value}</div>
            ${sub ? `<div style="color:#7a7a86;font-size:12px;margin-top:2px">${sub}</div>` : ""}
          </div>
        </td>`;
  const profitPct = st.profitPctOfCap === null ? "–" : pct(st.profitPctOfCap / 100, lang, true, 1);
  const grid = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 -6px 12px">
        <tr>
          ${cell(cs ? "Vyhodnocené tipy" : "Settled tips", String(st.tips), "#e8e8ec", st.pending ? (cs ? `${st.pending} čeká na vyhodnocení` : `${st.pending} pending`) : "")}
          ${cell(cs ? "Úspěšnost" : "Win rate", st.winRate === null ? "–" : pct(st.winRate, lang, false))}
        </tr>
        <tr>
          ${cell("ROI", pct(st.roi, lang), colorOf(st.roi), cs ? "zisk ÷ vloženo" : "profit ÷ entered")}
          ${cell(cs ? "Zisk z kapitálu" : "Profit of capital", profitPct, colorOf(st.net), money(st.net, lang, true))}
        </tr>
      </table>`;

  let progress = "";
  if (p.progress && p.progress.target > 0) {
    const ratio = Math.max(0, Math.min(1, p.progress.profit / p.progress.target));
    const w = Math.round(ratio * 100);
    const left = Math.max(0, p.progress.target - p.progress.profit);
    const line = cs
      ? `Cíl ${phaseLabel}: <b style="color:#e8e8ec">${money(Math.max(0, p.progress.profit), lang)}</b> z ${money(p.progress.target, lang)} (${w} %)${left > 0 ? ` — zbývá ${money(left, lang)}` : " — cíl splněn"}`
      : `${phaseLabel} target: <b style="color:#e8e8ec">${money(Math.max(0, p.progress.profit), lang)}</b> of ${money(p.progress.target, lang)} (${w}%)${left > 0 ? ` — ${money(left, lang)} to go` : " — target reached"}`;
    progress = `
      <p style="color:${muted};font-size:13px;line-height:1.6;margin:4px 0 8px">${line}</p>
      <div style="background:#ffffff14;border-radius:4px;height:8px;overflow:hidden;margin:0 0 20px">
        <div style="background:${green};height:8px;width:${w}%;border-radius:4px"></div>
      </div>`;
  } else if (p.phase >= 3) {
    progress = `<p style="color:${muted};font-size:13px;line-height:1.6;margin:4px 0 20px">${cs
      ? "Partner účet nemá cíl fáze — pro odměnu drž zisk nad rezervou a aspoň 5 kvalifikačních tipů."
      : "Partner accounts have no phase target — for a reward keep profit above the buffer and at least 5 qualifying tips."}</p>`;
  }

  const block = (title: string, body: string, accent: string) => `
      <div style="border-left:3px solid ${accent};background:#121219;border-radius:8px;padding:12px 14px;margin:0 0 10px">
        <div style="color:#7a7a86;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">${title}</div>
        <div style="color:${muted};font-size:14px;line-height:1.6">${body}</div>
      </div>`;
  const insights = [
    st.best ? block(cs ? "Co ti šlo" : "What worked", segSentence(st.best, "best", lang), green) : "",
    st.worst ? block(cs ? "Kde jsi ztrácel(a)" : "Where you lost", segSentence(st.worst, "worst", lang), "#ff4d4d") : "",
    block(cs ? "Disciplína vkladů" : "Entry discipline", disciplineSentence(st, lang), "#9945ff"),
  ].join("");

  const t = cs
    ? {
      h: "Tvůj týden ve Fundly",
      intro: "Krátký přehled tvých tipů za posledních 7 dní — co fungovalo a na co si dát pozor.",
      btn: "Otevřít celou analýzu",
      why: "Tenhle přehled ti posíláme jednou týdně, když máš aktivní účet a vyhodnocené tipy.",
      unsub: "Odhlásit týdenní přehled",
      q: `Máš otázky? Napiš nám na <a href="mailto:support@fundly.games" style="color:#7a7a86">support@fundly.games</a>.`,
    }
    : {
      h: "Your week on Fundly",
      intro: "A quick look at your tips from the last 7 days — what worked and what to watch.",
      btn: "Open the full analytics",
      why: "We send this summary once a week while you have an active account with settled tips.",
      unsub: "Unsubscribe from the weekly report",
      q: `Questions? Reach us at <a href="mailto:support@fundly.games" style="color:#7a7a86">support@fundly.games</a>.`,
    };

  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 4px">${t.h}</h2>
      <p style="color:#7a7a86;font-size:12px;margin:0 0 12px">${esc(p.pkgName)} · ${phaseLabel} · ${periodLabel(p.fromMs, p.toMs, lang)}</p>
      <p style="color:${muted};font-size:14px;line-height:1.6;margin:0 0 16px">${!st.tips && p.monthly
        ? (cs ? "Za posledních 7 dní nemáš vyhodnocené tipy — tady je přehled celého minulého měsíce." : "No settled tips in the last 7 days — here is your recap of last month.")
        : t.intro}</p>
      ${p.monthly ? monthlyHtml(p.monthly, p.monthLink ?? p.dashboardLink, lang) : ""}
      ${st.tips ? grid : ""}
      ${progress}
      ${st.tips ? insights : ""}
      <a href="${esc(p.dashboardLink)}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px;margin-top:10px">${t.btn}</a>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      <p style="color:#5a5a66;font-size:11px;line-height:1.6;margin:0">${OPERATOR}<br />${t.q}<br />${t.why} <a href="${esc(p.unsubscribeLink)}" style="color:#7a7a86">${t.unsub}</a></p>
    </div>
  </div>`;
}
