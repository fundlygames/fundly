/* Fundly — osobní analýza tipů (sekce Výkon → záložka "Analýza").
   Vše se počítá v prohlížeči z Portfolio.get().tickets (js/portfolio.js), nic se neposílá na server.
   - úspěšnost a ROI (zisk / vloženo) podle sportu, ligy (top 8), kurzového pásma, trhu, single/kombinace, dne v týdnu
   - disciplína vkladů: průměrný vklad v % kapitálu, variabilita (CV), podíl tipů nad 1 % kapitálu,
     největší vklad, vklad po prohraném vs. po úspěšném tipu (dohánění ztrát)
   - automatické postřehy: 2–3 nejhorší a nejlepší segmenty (min. 5 vyhodnocených tipů)
   Serverová obdoba pro týdenní e-mail: supabase/functions/_shared/weekly-report-stats.ts (držet v souladu).
   Texty: FUNDLY_I18N.extend (jmenný prostor "an"), překreslení na "fundly:lang-changed". */
(function () {
  "use strict";

  const MIN_SETTLED = 5; // pod tímhle počtem vyhodnocených tipů jen prázdný stav
  const MIN_SEGMENT = 5; // segment do postřehů až od tolika vyhodnocených tipů
  const TOP_LEAGUES = 8;
  const SETTLED = { won: 1, lost: 1, push: 1, cashedout: 1 };
  const BANDS = [
    { key: "b1", min: 1.0, max: 1.5, label: "1.00–1.50" },
    { key: "b2", min: 1.5, max: 2.0, label: "1.50–2.00" },
    { key: "b3", min: 2.0, max: 3.0, label: "2.00–3.00" },
    { key: "b4", min: 3.0, max: 5.0, label: "3.00–5.00" },
    { key: "b5", min: 5.0, max: 8.0, label: "5.00–8.00" },
    { key: "b6", min: 8.0, max: Infinity, label: "8.00+" }, // jen kombinace (single kurz je max. 8.00)
  ];
  const DIMS = ["band", "sport", "league", "market", "type", "weekday"];

  // ------------------------------------------------------------------
  // výpočty (čisté funkce — testovatelné v node, viz module.exports dole)
  // ------------------------------------------------------------------
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const isVoid = (t) => !!t.voidReason;
  const isSettled = (t) => !!SETTLED[t.status] && !isVoid(t);
  const net = (t) => num(t.payout) - num(t.stake);
  const sels = (t) => (Array.isArray(t.selections) ? t.selections : []);
  const oddsOf = (t) => {
    const c = num(t.combinedOdds);
    if (c > 0) return c;
    return sels(t).reduce((a, s) => a * (num(s.oddValue) || 1), 1);
  };

  function bandOf(odds) {
    const o = num(odds);
    if (o >= 8.0 + 1e-9) return BANDS[5];
    for (let i = 0; i < 5; i++) {
      if (o < BANDS[i].max - 1e-9 || i === 4) return BANDS[i];
    }
    return BANDS[4];
  }

  // společná hodnota všech výběrů tipu (sport/liga/trh); kombinace přes víc hodnot → "__mixed"
  function commonValue(t, field) {
    const vals = sels(t).map((s) => s && s[field]).filter((v) => v !== undefined && v !== null && v !== "");
    if (!vals.length) return "__unknown";
    return vals.every((v) => v === vals[0]) ? String(vals[0]) : "__mixed";
  }

  // pondělí = 0 … neděle = 6 (lokální čas prohlížeče; server používá UTC)
  function weekdayOf(iso, utc) {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return -1;
    return ((utc ? d.getUTCDay() : d.getDay()) + 6) % 7;
  }

  function keyOf(dim, t, opts) {
    switch (dim) {
      case "band": return bandOf(oddsOf(t)).key;
      case "sport": return commonValue(t, "sport");
      case "league": return commonValue(t, "league");
      case "market": return commonValue(t, "marketName");
      case "type": return sels(t).length > 1 ? "combo" : "single";
      case "weekday": return String(weekdayOf(t.placedAt, opts && opts.utc));
      default: return "__unknown";
    }
  }

  function newSeg(dim, key) { return { dim, key, n: 0, won: 0, lost: 0, staked: 0, net: 0, winRate: null, roi: 0 }; }
  function addTo(seg, t) {
    seg.n++;
    if (t.status === "won") seg.won++;
    else if (t.status === "lost") seg.lost++;
    seg.staked += num(t.stake);
    seg.net += net(t);
  }
  function finish(seg) {
    seg.winRate = seg.won + seg.lost ? seg.won / (seg.won + seg.lost) : null;
    seg.roi = seg.staked > 0 ? seg.net / seg.staked : 0;
    return seg;
  }

  function groupBy(dim, settled, opts) {
    const map = new Map();
    settled.forEach((t) => {
      const k = keyOf(dim, t, opts);
      if (k === "__unknown" || k === "-1") return;
      if (!map.has(k)) map.set(k, newSeg(dim, k));
      addTo(map.get(k), t);
    });
    let list = [...map.values()].map(finish);
    if (dim === "band") list.sort((a, b) => a.key.localeCompare(b.key));
    else if (dim === "weekday") list.sort((a, b) => Number(a.key) - Number(b.key));
    else if (dim === "type") list.sort((a, b) => (a.key === "single" ? -1 : 1) - (b.key === "single" ? -1 : 1));
    else {
      // podle objemu; "Mix" (kombinace přes víc sportů/trhů) na konec, u lig vynechat
      // (kombinace přes víc lig nejsou liga — ukazuje je řádek Single vs. kombinace)
      list.sort((a, b) => (a.key === "__mixed") - (b.key === "__mixed") || b.n - a.n || b.staked - a.staked || String(a.key).localeCompare(String(b.key)));
      if (dim === "league") list = list.filter((s) => s.key !== "__mixed").slice(0, TOP_LEAGUES);
    }
    return list;
  }

  function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
  function stdev(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length);
  }

  // Vklad po prohraném vs. po úspěšném tipu: pro každý tip se najde poslední tip
  // vyhodnocený PŘED jeho podáním — byl-li prohraný, jde vklad do "po prohře".
  function afterOutcome(tickets) {
    const placed = tickets.filter((t) => !isVoid(t) && t.placedAt).slice()
      .sort((a, b) => new Date(a.placedAt) - new Date(b.placedAt));
    const done = tickets.filter((t) => isSettled(t) && t.settledAt && (t.status === "won" || t.status === "lost")).slice()
      .sort((a, b) => new Date(a.settledAt) - new Date(b.settledAt));
    const afterLoss = [], afterWin = [];
    let i = 0, last = null;
    placed.forEach((t) => {
      const at = new Date(t.placedAt).getTime();
      while (i < done.length && new Date(done[i].settledAt).getTime() <= at) { last = done[i]; i++; }
      if (!last || last === t) return;
      (last.status === "lost" ? afterLoss : afterWin).push(num(t.stake));
    });
    return { afterLoss, afterWin };
  }

  function discipline(tickets, cap) {
    const list = tickets.filter((t) => !isVoid(t) && num(t.stake) > 0);
    const stakes = list.map((t) => num(t.stake));
    const capital = num(cap);
    const m = mean(stakes);
    const { afterLoss, afterWin } = afterOutcome(tickets);
    const avgLoss = mean(afterLoss), avgWin = mean(afterWin);
    const ratio = afterLoss.length >= 3 && afterWin.length >= 3 && avgWin > 0 ? avgLoss / avgWin : null;
    const maxStake = stakes.length ? Math.max(...stakes) : 0;
    return {
      count: stakes.length,
      avgStake: m,
      avgPct: capital > 0 ? (m / capital) * 100 : null,
      cv: m > 0 && stakes.length >= 2 ? stdev(stakes) / m : null,
      above1Share: stakes.length && capital > 0 ? stakes.filter((s) => s > capital * 0.01 + 1e-9).length / stakes.length : null,
      maxStake,
      maxPct: capital > 0 ? (maxStake / capital) * 100 : null,
      afterLossAvg: afterLoss.length ? avgLoss : null,
      afterWinAvg: afterWin.length ? avgWin : null,
      afterLossN: afterLoss.length,
      afterWinN: afterWin.length,
      chaseRatio: ratio,
      chasing: ratio !== null && ratio >= 1.25,
    };
  }

  // 2–3 nejhorší (ROI < 0) a nejlepší (ROI > 0) segmenty s aspoň MIN_SEGMENT tipy.
  // Segment, který pokrývá všechny tipy (např. jediný sport), nic neříká → vynechá se.
  // Nejdřív jeden segment z každé dimenze (pestřejší postřehy), pak se doplní.
  function pickInsights(groups, totalSettled) {
    const cands = [];
    DIMS.forEach((d) => (groups[d] || []).forEach((s) => {
      if (s.n >= MIN_SEGMENT && s.n < totalSettled && s.key !== "__mixed" && s.staked > 0) cands.push(s);
    }));
    const pick = (list) => {
      const out = [], used = new Set();
      list.forEach((s) => { if (out.length < 3 && !used.has(s.dim)) { out.push(s); used.add(s.dim); } });
      list.forEach((s) => { if (out.length < 3 && !out.includes(s)) out.push(s); });
      return out;
    };
    const worst = pick(cands.filter((s) => s.roi < -0.005).sort((a, b) => a.roi - b.roi || b.n - a.n));
    const best = pick(cands.filter((s) => s.roi > 0.005).sort((a, b) => b.roi - a.roi || b.n - a.n));
    return { worst, best };
  }

  function compute(tickets, cap, opts) {
    const all = Array.isArray(tickets) ? tickets : [];
    const settled = all.filter(isSettled);
    const total = finish(settled.reduce((seg, t) => { addTo(seg, t); return seg; }, newSeg("all", "all")));
    const groups = {};
    DIMS.forEach((d) => { groups[d] = groupBy(d, settled, opts); });
    return {
      settledCount: settled.length,
      pendingCount: all.filter((t) => t.status === "pending").length,
      ready: settled.length >= MIN_SETTLED,
      total,
      groups,
      discipline: discipline(all, cap),
      insights: pickInsights(groups, settled.length),
    };
  }

  const API = { compute, bandOf, BANDS, MIN_SETTLED, MIN_SEGMENT };

  if (typeof module === "object" && module.exports) {
    module.exports = API;
  }
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // ------------------------------------------------------------------
  // texty (en + cs; sk spadne na cs přes FUNDLY_I18N.t)
  // ------------------------------------------------------------------
  if (typeof FUNDLY_I18N !== "undefined") {
    FUNDLY_I18N.extend("en", { an: {
      tabOverview: "Overview", tabAnalytics: "Analytics", tabsLabel: "Performance sections",
      title: "Analytics", subtitle: "What works for you and where you lose — from your settled tips.",
      emptyTitle: "Analytics unlock after {min} settled tips",
      emptyBody: "You have {n} settled so far. Keep tipping — once {min} are settled you'll see your win rate and ROI by sport, league, odds and market, plus tips on where you lose.",
      settled: "Settled tips", winRate: "Win rate", roi: "ROI", netProfit: "Net profit",
      roiHint: "ROI = profit ÷ total entered",
      colRoi: "ROI", colWin: "Win rate", colN: "Tips",
      bySport: "By sport", byLeague: "By league (top 8)", byBand: "By odds", byMarket: "By market",
      byType: "Singles vs. combos", byWeekday: "By weekday",
      single: "Singles", combo: "Combos", mixed: "Mixed", lowSample: "Fewer than {min} tips — small sample",
      tipsN: { one: "{n} tip", few: "{n} tips", other: "{n} tips" },
      whereLose: "Where you lose", whereWin: "What works for you",
      noWorst: "No segment with at least {min} tips is in the red. Nice.",
      noBest: "No segment with at least {min} tips is in profit yet.",
      worst: {
        band: "On odds {seg} your ROI is {roi} over {n} tips — consider smaller entries or skip them.",
        sport: "In {seg} your ROI is {roi} over {n} tips — consider smaller entries or fewer tips there.",
        league: "In {seg} your ROI is {roi} over {n} tips — consider smaller entries or skip this league.",
        market: "On the {seg} market your ROI is {roi} over {n} tips — consider smaller entries or skip it.",
        type: "With {seg} your ROI is {roi} over {n} tips — consider smaller entries or fewer of them.",
        weekday: "On {seg} your ROI is {roi} over {n} tips — maybe take that day slower.",
      },
      best: {
        band: "On odds {seg} your ROI is {roi} over {n} tips (win rate {wr}) — this is your zone.",
        sport: "In {seg} your ROI is {roi} over {n} tips (win rate {wr}) — you know this sport.",
        league: "In {seg} your ROI is {roi} over {n} tips (win rate {wr}) — keep an eye on this league.",
        market: "On the {seg} market your ROI is {roi} over {n} tips (win rate {wr}) — it works for you.",
        type: "With {seg} your ROI is {roi} over {n} tips (win rate {wr}) — stick with it.",
        weekday: "On {seg} your ROI is {roi} over {n} tips (win rate {wr}).",
      },
      weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      weekdaysLong: ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"],
      singleLong: "singles", comboLong: "combos",
      disc: {
        title: "Entry discipline", avgPct: "Average entry", cv: "Entry variability", above1: "Tips above 1% of capital",
        maxStake: "Biggest entry", afterLoss: "Avg. entry after a lost tip", afterWin: "Avg. entry after a successful tip",
        ofCap: "{pct} of capital", na: "–",
        cvLow: "steady", cvMid: "varied", cvHigh: "very uneven",
        chasing: "After a lost tip you enter on average {pct} more than after a successful one — watch out for chasing losses.",
        calm: "Your entry after a lost tip stays in line with the rest — good, no chasing losses.",
        notEnough: "Not enough tips yet to compare entries after lost and successful tips.",
        above1Note: "{pct} of your tips are above 1% of capital. Consistent entries of 0.5–1% keep you far from the loss limit.",
        cvNote: "Your entry sizes vary a lot (CV {cv}). A steady size makes results easier to read.",
        goodNote: "Entries are steady and sensible — keep it that way.",
      },
    } });
    FUNDLY_I18N.extend("cs", { an: {
      tabOverview: "Přehled", tabAnalytics: "Analýza", tabsLabel: "Části sekce Výkon",
      title: "Analýza", subtitle: "Co ti jde a kde ztrácíš — z tvých vyhodnocených tipů.",
      emptyTitle: "Analýza se odemkne po {min} vyhodnocených tipech",
      emptyBody: "Zatím máš vyhodnocených {n}. Tipuj dál — jakmile jich bude {min}, uvidíš úspěšnost a ROI podle sportu, ligy, kurzu a trhu a k tomu postřehy, kde ztrácíš.",
      settled: "Vyhodnocené tipy", winRate: "Úspěšnost", roi: "ROI", netProfit: "Čistý zisk",
      roiHint: "ROI = zisk ÷ celkem vloženo",
      colRoi: "ROI", colWin: "Úspěšnost", colN: "Tipy",
      bySport: "Podle sportu", byLeague: "Podle ligy (top 8)", byBand: "Podle kurzu", byMarket: "Podle trhu",
      byType: "Single vs. kombinace", byWeekday: "Podle dne v týdnu",
      single: "Single", combo: "Kombinace", mixed: "Mix", lowSample: "Méně než {min} tipů — malý vzorek",
      tipsN: { one: "{n} tip", few: "{n} tipy", other: "{n} tipů" },
      whereLose: "Kde ztrácíš", whereWin: "Co ti jde",
      noWorst: "Žádný segment s aspoň {min} tipy není v minusu. Dobrá práce.",
      noBest: "Zatím žádný segment s aspoň {min} tipy není v plusu.",
      worst: {
        band: "Na kurzech {seg} máš ROI {roi} z {n} tipů — zvaž menší vklady nebo se jim vyhni.",
        sport: "Ve sportu {seg} máš ROI {roi} z {n} tipů — zvaž menší vklady nebo tam tipuj méně.",
        league: "V soutěži {seg} máš ROI {roi} z {n} tipů — zvaž menší vklady nebo se jí vyhni.",
        market: "Na trhu {seg} máš ROI {roi} z {n} tipů — zvaž menší vklady nebo se mu vyhni.",
        type: "U {seg} máš ROI {roi} z {n} tipů — zvaž menší vklady nebo jich dávej méně.",
        weekday: "{seg} máš ROI {roi} z {n} tipů — ten den možná zpomal.",
      },
      best: {
        band: "Na kurzech {seg} máš ROI {roi} z {n} tipů (úspěšnost {wr}) — tohle je tvoje zóna.",
        sport: "Ve sportu {seg} máš ROI {roi} z {n} tipů (úspěšnost {wr}) — tenhle sport znáš.",
        league: "V soutěži {seg} máš ROI {roi} z {n} tipů (úspěšnost {wr}) — tuhle ligu sleduj dál.",
        market: "Na trhu {seg} máš ROI {roi} z {n} tipů (úspěšnost {wr}) — tenhle trh ti sedí.",
        type: "U {seg} máš ROI {roi} z {n} tipů (úspěšnost {wr}) — drž se toho.",
        weekday: "{seg} máš ROI {roi} z {n} tipů (úspěšnost {wr}).",
      },
      weekdays: ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"],
      weekdaysLong: ["V pondělí", "V úterý", "Ve středu", "Ve čtvrtek", "V pátek", "V sobotu", "V neděli"],
      singleLong: "single tipů", comboLong: "kombinací",
      disc: {
        title: "Disciplína vkladů", avgPct: "Průměrný vklad", cv: "Variabilita vkladů", above1: "Tipy nad 1 % kapitálu",
        maxStake: "Největší vklad", afterLoss: "Prům. vklad po prohraném tipu", afterWin: "Prům. vklad po úspěšném tipu",
        ofCap: "{pct} kapitálu", na: "–",
        cvLow: "stabilní", cvMid: "kolísavá", cvHigh: "hodně nevyrovnaná",
        chasing: "Po prohraném tipu dáváš v průměru o {pct} větší vklad než po úspěšném — pozor na dohánění ztrát.",
        calm: "Vklad po prohraném tipu držíš stejný jako jindy — dobře, ztráty nedoháníš.",
        notEnough: "Zatím málo tipů na porovnání vkladů po prohraném a úspěšném tipu.",
        above1Note: "{pct} tvých tipů má vklad nad 1 % kapitálu. Stálé vklady 0,5–1 % tě drží daleko od limitu ztráty.",
        cvNote: "Výše vkladů ti hodně kolísá (CV {cv}). Stálý vklad ti usnadní čtení výsledků.",
        goodNote: "Vklady máš stálé a rozumné — jen tak dál.",
      },
    } });
  }

  // ------------------------------------------------------------------
  // formátování
  // ------------------------------------------------------------------
  const tr = (k) => (typeof window.t === "function" ? window.t(k) : k);
  const trf = (k, vars) => String(tr(k)).replace(/\{(\w+)\}/g, (m, key) => (vars && vars[key] !== undefined ? vars[key] : m));
  const trp = (k, n) => trf(`${k}.${n === 1 ? "one" : n >= 2 && n <= 4 ? "few" : "other"}`, { n });
  const lang = () => {
    const l = (typeof FUNDLY_I18N !== "undefined" && FUNDLY_I18N.getLang()) || "en";
    return l === "cs" || l === "sk" ? "cs" : "en";
  };
  const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pctSep = () => (lang() === "cs" ? " %" : "%");
  const fmtNum = (v, d) => {
    const s = Math.abs(v).toFixed(d);
    return lang() === "cs" ? s.replace(".", ",") : s;
  };
  const signedPct = (ratio) => {
    const p = Math.round(ratio * 100);
    return (p > 0 ? "+" : p < 0 ? "−" : "") + Math.abs(p) + pctSep();
  };
  const plainPct = (ratio, d) => fmtNum(ratio * 100, d || 0) + pctSep();
  const money = (n) => (typeof usd === "function" ? usd(n) : "$" + Math.round(n).toLocaleString("en-US"));
  const signedMoney = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + money(Math.abs(n));
  const arr = (k) => { const v = tr(k); return Array.isArray(v) ? v : []; };

  function segLabel(seg) {
    if (seg.key === "__mixed") return tr("an.mixed");
    switch (seg.dim) {
      case "band": return (BANDS.find((b) => b.key === seg.key) || {}).label || seg.key;
      case "sport": return typeof sportName === "function" ? sportName(seg.key, seg.key) : seg.key;
      case "market": return typeof marketLabel === "function" ? marketLabel(seg.key) : seg.key;
      case "type": return tr(seg.key === "combo" ? "an.combo" : "an.single");
      case "weekday": return arr("an.weekdays")[Number(seg.key)] || seg.key;
      default: return seg.key;
    }
  }
  // tvar do věty ("V pondělí", "kombinací" …)
  function segPhrase(seg) {
    if (seg.dim === "weekday") return arr("an.weekdaysLong")[Number(seg.key)] || segLabel(seg);
    if (seg.dim === "type") return tr(seg.key === "combo" ? "an.comboLong" : "an.singleLong");
    return segLabel(seg);
  }
  // texty slovníku jsou naše (bez HTML), dosazované hodnoty se escapují
  function insightText(seg, kind) {
    return trf(`an.${kind}.${seg.dim}`, {
      seg: `<b>${esc(segPhrase(seg))}</b>`,
      roi: `<b>${signedPct(seg.roi)}</b>`,
      n: seg.n,
      wr: seg.winRate === null ? "–" : plainPct(seg.winRate),
    });
  }

  // ------------------------------------------------------------------
  // vykreslení
  // ------------------------------------------------------------------
  function rowsHtml(list) {
    if (!list.length) return `<p class="an-muted">–</p>`;
    const maxAbs = Math.max(0.05, ...list.map((s) => Math.abs(s.roi)));
    return `<div class="an-rows">
      <div class="an-row an-head"><span class="an-lbl"></span><span class="an-bar-h">${esc(tr("an.colRoi"))}</span><span class="an-wr">${esc(tr("an.colWin"))}</span><span class="an-n">${esc(tr("an.colN"))}</span></div>
      ${list.map((s) => {
        const w = Math.max(2, Math.round((Math.abs(s.roi) / maxAbs) * 50));
        const cls = s.roi > 0.005 ? "pos" : s.roi < -0.005 ? "neg" : "zero";
        const low = s.n < MIN_SEGMENT;
        return `<div class="an-row${low ? " low" : ""}"${low ? ` title="${esc(trf("an.lowSample", { min: MIN_SEGMENT }))}"` : ""}>
          <span class="an-lbl">${esc(segLabel(s))}</span>
          <span class="an-bar"><span class="an-track"><span class="an-fill ${cls}" style="width:${w}%"></span></span><span class="an-roi ${cls}">${signedPct(s.roi)}</span></span>
          <span class="an-wr">${s.winRate === null ? "–" : plainPct(s.winRate)}</span>
          <span class="an-n">${s.n}</span>
        </div>`;
      }).join("")}
    </div>`;
  }

  function panel(titleKey, body, extraCls) {
    return `<div class="panel an-panel${extraCls ? " " + extraCls : ""}"><h3>${esc(tr(titleKey))}</h3>${body}</div>`;
  }

  function disciplineHtml(d) {
    const na = tr("an.disc.na");
    const cvLabel = d.cv === null ? na
      : `${fmtNum(d.cv, 2)} · ${tr(d.cv < 0.35 ? "an.disc.cvLow" : d.cv < 0.7 ? "an.disc.cvMid" : "an.disc.cvHigh")}`;
    const rows = [
      [tr("an.disc.avgPct"), d.avgPct === null ? na : `${money(d.avgStake)} · ${trf("an.disc.ofCap", { pct: fmtNum(d.avgPct, 2) + pctSep() })}`],
      [tr("an.disc.cv"), cvLabel],
      [tr("an.disc.above1"), d.above1Share === null ? na : plainPct(d.above1Share)],
      [tr("an.disc.maxStake"), d.maxPct === null ? money(d.maxStake) : `${money(d.maxStake)} · ${trf("an.disc.ofCap", { pct: fmtNum(d.maxPct, 2) + pctSep() })}`],
      [tr("an.disc.afterLoss"), d.afterLossAvg === null ? na : money(d.afterLossAvg)],
      [tr("an.disc.afterWin"), d.afterWinAvg === null ? na : money(d.afterWinAvg)],
    ];
    const notes = [];
    if (d.chaseRatio === null) notes.push(["", tr("an.disc.notEnough")]);
    else if (d.chasing) notes.push(["warn", trf("an.disc.chasing", { pct: plainPct(d.chaseRatio - 1) })]);
    else notes.push(["ok", tr("an.disc.calm")]);
    if (d.above1Share !== null && d.above1Share >= 0.25) notes.push(["warn", trf("an.disc.above1Note", { pct: plainPct(d.above1Share) })]);
    if (d.cv !== null && d.cv >= 0.7) notes.push(["warn", trf("an.disc.cvNote", { cv: fmtNum(d.cv, 2) })]);
    if (!notes.some((n) => n[0] === "warn") && d.chaseRatio !== null) notes.push(["ok", tr("an.disc.goodNote")]);
    return `<div class="k-rows">${rows.map(([k, v]) => `<div class="k-row neutral">${esc(k)}<span class="n">${esc(v)}</span></div>`).join("")}</div>
      <ul class="an-notes">${notes.map(([c, txt]) => `<li class="${c}">${esc(txt)}</li>`).join("")}</ul>`;
  }

  function insightsHtml(ins) {
    const list = (items, kind, emptyKey) => items.length
      ? `<ul class="an-ins ${kind}">${items.map((s) => `<li>${insightText(s, kind)}</li>`).join("")}</ul>`
      : `<p class="an-muted">${esc(trf(emptyKey, { min: MIN_SEGMENT }))}</p>`;
    return `<div class="two-col an-ins-grid">
      ${panel("an.whereLose", list(ins.worst, "worst", "an.noWorst"), "an-lose")}
      ${panel("an.whereWin", list(ins.best, "best", "an.noBest"), "an-win")}
    </div>`;
  }

  function render() {
    const root = document.getElementById("analyticsRoot");
    if (!root || root.hidden) return;
    const state = typeof Portfolio !== "undefined" ? Portfolio.get() : null;
    const tickets = (state && state.tickets) || [];
    const a = compute(tickets, state && state.cap);
    if (!a.ready) {
      const pct = Math.min(100, Math.round((a.settledCount / MIN_SETTLED) * 100));
      root.innerHTML = `<div class="panel an-empty">
        <h3>${esc(trf("an.emptyTitle", { min: MIN_SETTLED }))}</h3>
        <p>${esc(trf("an.emptyBody", { n: a.settledCount, min: MIN_SETTLED }))}</p>
        <div class="progress" style="margin-top:14px"><span style="width:${pct}%"></span></div>
        <p class="an-muted" style="margin-top:8px">${a.settledCount} / ${MIN_SETTLED}</p>
      </div>`;
      return;
    }
    const T = a.total;
    const stat = (lbl, val, cls) => `<div class="dstat"><div class="lbl">${esc(lbl)}</div><div class="val ${cls || ""}">${esc(val)}</div></div>`;
    const g = a.groups;
    root.innerHTML = `
      <div class="stat-grid an-stats" style="margin-top:0">
        ${stat(tr("an.settled"), String(a.settledCount))}
        ${stat(tr("an.winRate"), T.winRate === null ? "–" : plainPct(T.winRate), T.winRate !== null && T.winRate >= 0.5 ? "green" : "")}
        ${stat(tr("an.roi"), signedPct(T.roi), T.roi > 0 ? "green" : T.roi < 0 ? "red" : "")}
        ${stat(tr("an.netProfit"), signedMoney(T.net), T.net > 0 ? "green" : T.net < 0 ? "red" : "")}
      </div>
      <p class="an-muted an-hint">${esc(tr("an.roiHint"))}</p>
      ${insightsHtml(a.insights)}
      <div class="two-col">
        ${panel("an.bySport", rowsHtml(g.sport))}
        ${panel("an.byBand", rowsHtml(g.band))}
      </div>
      <div class="two-col">
        ${panel("an.byLeague", rowsHtml(g.league))}
        ${panel("an.byMarket", rowsHtml(g.market))}
      </div>
      <div class="two-col">
        ${panel("an.byType", rowsHtml(g.type))}
        ${panel("an.byWeekday", rowsHtml(g.weekday))}
      </div>
      <div class="an-disc">
        ${panel("an.disc.title", disciplineHtml(a.discipline))}
      </div>`;
  }

  // ------------------------------------------------------------------
  // záložky Přehled / Analýza uvnitř #view-vykon
  // ------------------------------------------------------------------
  let active = "overview";
  function setTab(tab) {
    active = tab === "analytics" ? "analytics" : "overview";
    const view = document.getElementById("view-vykon");
    const root = document.getElementById("analyticsRoot");
    if (!view || !root) return;
    view.classList.toggle("an-mode", active === "analytics");
    root.hidden = active !== "analytics";
    view.querySelectorAll("[data-an-tab]").forEach((b) => {
      const on = b.dataset.anTab === active;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    if (active === "analytics") render();
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-an-tab]");
    if (b) setTab(b.dataset.anTab);
  });
  document.addEventListener("fundly:lang-changed", () => render());

  // i18n.js přeložil data-i18n už před načtením tohohle souboru (slovník "an" ještě neexistoval) →
  // vlastní prvky (záložky) přeložit hned; další změny jazyka už obslouží i18n.js sám.
  document.querySelectorAll(".an-tabs [data-i18n], .an-tabs[data-i18n-aria-label]").forEach((el) => {
    if (el.dataset.i18n) el.textContent = tr(el.dataset.i18n);
    if (el.dataset.i18nAriaLabel) el.setAttribute("aria-label", tr(el.dataset.i18nAriaLabel));
  });

  // odkaz z týdenního e-mailu: dashboard#analytics → rovnou Výkon → Analýza
  function deepLink() {
    if (location.hash !== "#analytics") return;
    if (document.body.classList.contains("limited")) return;
    if (typeof showView === "function") showView("vykon");
    setTab("analytics");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(deepLink, 0));
  else setTimeout(deepLink, 0);

  window.FundlyAnalytics = { compute, render, setTab };
})();
