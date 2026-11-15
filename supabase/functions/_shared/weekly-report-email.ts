// _shared/weekly-report-email.ts — šablona týdenního e-mailu s analýzou tipů (funkce weekly-report).
// Stejný tmavý vzhled jako šablony v _shared/email.ts. Bez závislostí na Deno (jde vyrenderovat
// v node --experimental-strip-types). Jazyk: "cs" (i pro sk) nebo cokoli jiného = anglicky.
// Slovník (cs): tip/tipy, odměna, vklad — nikdy "tiket", "výplata", "sázka", "výhra".
import { BAND_LABELS, type Segment, type WeeklyStats } from "./weekly-report-stats.ts";

const OPERATOR = "Grindit LLC · Sharjah Media City, Sharjah, UAE · Reg. 2541536";
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
}

export function weeklyReportSubject(st: WeeklyStats, lang: string): string {
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
      <p style="color:${muted};font-size:14px;line-height:1.6;margin:0 0 16px">${t.intro}</p>
      ${grid}
      ${progress}
      ${insights}
      <a href="${esc(p.dashboardLink)}" style="display:inline-block;background:#14f195;color:#020204;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px;margin-top:10px">${t.btn}</a>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:24px 0 16px" />
      <p style="color:#5a5a66;font-size:11px;line-height:1.6;margin:0">${OPERATOR}<br />${t.q}<br />${t.why} <a href="${esc(p.unsubscribeLink)}" style="color:#7a7a86">${t.unsub}</a></p>
    </div>
  </div>`;
}
