/* Fundly — „Tvůj měsíc" (Výkon → záložka Měsíc) + výpočty pro nové odznaky.
   Vše se počítá v prohlížeči z Portfolio.get().tickets — nic se neposílá na server.
   • RecapCore (bez DOM, testovatelné v node přes require()):
       - disciplineStreak: série „disciplinovaných" tipovacích dní. Den se počítá, když hráč ten den
         podal aspoň jeden tip, ŽÁDNÝ vklad nebyl nad 1 % kapitálu a tipů nebylo víc než 5.
         Dny bez tipů sérii nepřeruší (nechceme hráče tlačit tipovat každý den), nedisciplinovaný den ano.
       - month: měsíční souhrn (vyhodnocené tipy podle settledAt, podané podle placedAt — místní čas)
       - compare: změna proti předchozímu měsíci (procentní body)
       - journalCount, hasGreenMonth (odznaky v js/dashboard.js)
   • Záložka Měsíc: výběr měsíce, statistiky, nejlepší sport a tip, kde ztrácíš (FundlyAnalytics),
     srovnání s minulým měsícem, disciplína, tlačítko „Sdílet" → js/share-card.js.
   Serverová obdoba pro měsíční blok v týdenním e-mailu: supabase/functions/_shared/monthly-recap.ts.
   Texty: FUNDLY_I18N.extend (jmenný prostor "rc"), en + cs (sk přebírá češtinu). */
(function () {
  "use strict";

  const SETTLED = { won: 1, lost: 1, push: 1, cashedout: 1 };
  const DISC_MAX_PCT = 0.01; // max. vklad v % kapitálu pro „disciplinovaný" den
  const DISC_MAX_TIPS = 5; // max. tipů za den
  const MIN_SPORT = 3; // nejlepší sport až od tolika vyhodnocených tipů
  const GREEN_MONTH_MIN = 10; // odznak „Měsíc v plusu": min. vyhodnocených tipů v měsíci

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const isSettled = (t) => !!SETTLED[t.status] && !t.voidReason;
  const net = (t) => num(t.payout) - num(t.stake);
  const sels = (t) => (Array.isArray(t.selections) ? t.selections : []);
  const pad = (n) => String(n).padStart(2, "0");
  function dayKey(iso) {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return null;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const monthKey = (iso) => { const d = dayKey(iso); return d ? d.slice(0, 7) : null; };
  function shiftMonth(key, delta) {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }
  function sportOf(t) {
    const v = sels(t).map((s) => s && s.sport).filter(Boolean);
    if (!v.length) return null;
    return v.every((x) => x === v[0]) ? String(v[0]) : null; // kombinace přes víc sportů se nepočítá
  }

  const RecapCore = {
    DISC_MAX_PCT, DISC_MAX_TIPS, MIN_SPORT, GREEN_MONTH_MIN,
    dayKey, monthKey, shiftMonth,

    // [{ day, n, ok }] vzestupně podle dne
    disciplineDays(tickets, cap) {
      const limit = num(cap) * DISC_MAX_PCT + 1e-6;
      const days = new Map();
      for (const t of tickets || []) {
        if (!t || !t.placedAt) continue;
        const k = dayKey(t.placedAt);
        if (!k) continue;
        const d = days.get(k) || { day: k, n: 0, ok: true };
        d.n += 1;
        if (num(cap) > 0 && num(t.stake) > limit) d.ok = false;
        days.set(k, d);
      }
      const out = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
      out.forEach((d) => { if (d.n > DISC_MAX_TIPS) d.ok = false; });
      return out;
    },

    // { current, best, lastOk } — current = série končící posledním tipovacím dnem
    disciplineStreak(tickets, cap) {
      let run = 0, best = 0;
      const days = RecapCore.disciplineDays(tickets, cap);
      for (const d of days) {
        run = d.ok ? run + 1 : 0;
        if (run > best) best = run;
      }
      return { current: run, best, days: days.length };
    },

    journalCount(tickets) {
      return (tickets || []).filter((t) => t && (t.note || (Array.isArray(t.noteTags) && t.noteTags.length))).length;
    },

    // měsíce s aspoň jedním vyhodnoceným tipem, od nejnovějšího
    months(tickets) {
      const set = new Set();
      for (const t of tickets || []) if (isSettled(t) && t.settledAt) set.add(monthKey(t.settledAt));
      set.delete(null);
      return [...set].sort().reverse();
    },

    hasGreenMonth(tickets, cap) {
      return RecapCore.months(tickets).some((k) => {
        const m = RecapCore.month(tickets, cap, k);
        return m.settled >= GREEN_MONTH_MIN && m.net > 0;
      });
    },

    month(tickets, cap, key) {
      const all = tickets || [];
      const settled = all.filter((t) => isSettled(t) && t.settledAt && monthKey(t.settledAt) === key)
        .sort((a, b) => String(a.settledAt).localeCompare(String(b.settledAt)));
      const placed = all.filter((t) => t.placedAt && monthKey(t.placedAt) === key);
      let won = 0, lost = 0, staked = 0, sum = 0, run = 0, bestRun = 0;
      const bySport = new Map();
      let bestTip = null;
      for (const t of settled) {
        const n = net(t);
        staked += num(t.stake);
        sum += n;
        if (t.status === "won") { won += 1; run += 1; bestRun = Math.max(bestRun, run); }
        else if (t.status === "lost") { lost += 1; run = 0; }
        const sp = sportOf(t);
        if (sp) {
          const s = bySport.get(sp) || { key: sp, n: 0, won: 0, lost: 0, staked: 0, net: 0 };
          s.n += 1; s.staked += num(t.stake); s.net += n;
          if (t.status === "won") s.won += 1;
          if (t.status === "lost") s.lost += 1;
          bySport.set(sp, s);
        }
        if (t.status === "won" && n > 0 && (!bestTip || n > bestTip.net)) bestTip = { ticket: t, net: n, odds: num(t.combinedOdds) };
      }
      const sports = [...bySport.values()].map((s) => ({ ...s, roi: s.staked > 0 ? s.net / s.staked : 0, winRate: s.won + s.lost ? s.won / (s.won + s.lost) : null }));
      const eligible = sports.filter((s) => s.n >= MIN_SPORT).sort((a, b) => b.roi - a.roi || b.n - a.n);
      const limit = num(cap) * DISC_MAX_PCT + 1e-6;
      const stakes = placed.map((t) => num(t.stake));
      const disc = RecapCore.disciplineDays(placed, cap);
      return {
        key,
        tips: placed.length,
        settled: settled.length,
        won, lost,
        winRate: won + lost ? won / (won + lost) : null,
        staked,
        net: sum,
        roi: staked > 0 ? sum / staked : 0,
        profitPct: num(cap) > 0 ? sum / num(cap) : null,
        bestSport: eligible[0] || null,
        bestTip,
        bestRun,
        activeDays: new Set(placed.map((t) => dayKey(t.placedAt))).size,
        disciplinedDays: disc.filter((d) => d.ok).length,
        discShare: stakes.length && num(cap) > 0 ? stakes.filter((s) => s <= limit).length / stakes.length : null,
        avgStakePct: stakes.length && num(cap) > 0 ? stakes.reduce((a, b) => a + b, 0) / stakes.length / num(cap) : null,
        notes: RecapCore.journalCount(placed),
        settledTickets: settled,
      };
    },

    // změny proti minulému měsíci; null, když minulý měsíc nemá aspoň 3 vyhodnocené tipy
    compare(cur, prev) {
      if (!prev || prev.settled < 3 || cur.settled < 1) return null;
      const d = (a, b) => (a === null || b === null ? null : a - b);
      return {
        prevKey: prev.key,
        winRate: d(cur.winRate, prev.winRate),
        roi: cur.roi - prev.roi,
        discShare: d(cur.discShare, prev.discShare),
        avgStakePct: d(cur.avgStakePct, prev.avgStakePct),
        settled: cur.settled - prev.settled,
      };
    },
  };

  if (typeof module !== "undefined" && module.exports) module.exports = RecapCore;
  if (typeof window === "undefined" || !window.FUNDLY_I18N) return;

  // ------------------------------------------------------------------
  // texty
  // ------------------------------------------------------------------
  FUNDLY_I18N.extend("en", { rc: {
    tab: "Month",
    kicker: "Your month on Fundly",
    empty: "Your monthly recap appears after your first settled tip.",
    tips: "Tips", settled: "Settled", winRate: "Win rate", roi: "ROI", profit: "Result (of capital)",
    bestSport: "Best sport", bestSportNone: "Needs at least {min} settled tips in one sport.",
    bestSportLine: "ROI {roi} · {tips} · win rate {wr}",
    bestTip: "Best tip", bestTipNone: "No successful tip this month yet.",
    combo: "Combo × {n}",
    oddsLabel: "odds {odds}",
    whereLose: "Where you lose", whereLoseNone: "Not enough data yet — each area needs at least 5 settled tips.",
    vsPrev: "Compared with {month}", vsPrevNone: "The comparison appears once the previous month has at least 3 settled tips.",
    cmpWinRate: "Win rate", cmpRoi: "ROI", cmpDisc: "Tips within 1 % of capital", cmpStake: "Average entry (of capital)",
    pp: "{v} pp",
    better: "better", worse: "worse", same: "unchanged",
    discipline: "Discipline",
    activeDays: "Days with tips", discDays: "Disciplined days", discShare: "Tips within 1 % of capital",
    avgStake: "Average entry", bestRun: "Longest run of successful tips", notes: "Tips with a journal note",
    streakNow: "Current discipline streak", streakDays: { one: "{n} day", few: "{n} days", other: "{n} days" }, streakBest: "record {n}",
    tipsN: { one: "{n} tip", few: "{n} tips", other: "{n} tips" },
    discHelp: "A day counts as disciplined when every entry that day is at most 1 % of capital and you place no more than 5 tips. Days without tips don't break the streak.",
    share: "Share my month", shareProgress: "Share",
    monthsLabel: "Month",
  } });
  FUNDLY_I18N.extend("cs", { rc: {
    tab: "Měsíc",
    kicker: "Tvůj měsíc na Fundly",
    empty: "Měsíční přehled se objeví po prvním vyhodnoceném tipu.",
    tips: "Tipy", settled: "Vyhodnocené", winRate: "Úspěšnost", roi: "ROI", profit: "Výsledek (z kapitálu)",
    bestSport: "Nejlepší sport", bestSportNone: "Potřebuje aspoň {min} vyhodnocené tipy v jednom sportu.",
    bestSportLine: "ROI {roi} · {tips} · úspěšnost {wr}",
    bestTip: "Nejlepší tip", bestTipNone: "Tento měsíc zatím bez úspěšného tipu.",
    combo: "Kombinace × {n}",
    oddsLabel: "kurz {odds}",
    whereLose: "Kde ztrácíš", whereLoseNone: "Zatím málo dat — každá oblast potřebuje aspoň 5 vyhodnocených tipů.",
    vsPrev: "Srovnání s předchozím měsícem ({month})", vsPrevNone: "Srovnání se objeví, až bude mít předchozí měsíc aspoň 3 vyhodnocené tipy.",
    cmpWinRate: "Úspěšnost", cmpRoi: "ROI", cmpDisc: "Tipy do 1 % kapitálu", cmpStake: "Průměrný vklad (z kapitálu)",
    pp: "{v} p. b.",
    better: "lepší", worse: "horší", same: "beze změny",
    discipline: "Disciplína",
    activeDays: "Dny s tipy", discDays: "Disciplinované dny", discShare: "Tipy do 1 % kapitálu",
    avgStake: "Průměrný vklad", bestRun: "Nejdelší série úspěšných tipů", notes: "Tipy s poznámkou v deníku",
    streakNow: "Aktuální série disciplíny", streakDays: { one: "{n} den", few: "{n} dny", other: "{n} dní" }, streakBest: "rekord {n}",
    tipsN: { one: "{n} tip", few: "{n} tipy", other: "{n} tipů" },
    discHelp: "Den se počítá jako disciplinovaný, když žádný tvůj vklad ten den nepřesáhne 1 % kapitálu a podáš nejvýš 5 tipů. Dny bez tipů sérii nepřeruší.",
    share: "Sdílet můj měsíc", shareProgress: "Sdílet",
    monthsLabel: "Měsíc",
  } });

  const I = window.FUNDLY_I18N;
  const tr = (k) => I.t(k);
  const trf = (k, v) => I.tf(k, v);
  // množné číslo: podklíče one / few (2–4) / other — angličtina má few = other
  const trp = (k, n) => trf(`${k}.${n === 1 ? "one" : n >= 2 && n <= 4 ? "few" : "other"}`, { n });
  const lang = () => (typeof I.getLang === "function" ? I.getLang() : "en");
  const locale = () => ({ cs: "cs-CZ", sk: "sk-SK", pl: "pl-PL", hu: "hu-HU", es: "es-ES" }[lang()] || "en-US");
  const isCsLike = () => lang() === "cs" || lang() === "sk";
  const pctSep = () => (lang() === "en" ? "%" : " %");
  const fmt = (v, d) => Number(v).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
  const plainPct = (r) => (r === null || r === undefined ? "–" : fmt(r * 100, 0) + pctSep());
  const signedPct = (r, d = 1) => {
    if (r === null || r === undefined) return "–";
    const v = Number((r * 100).toFixed(d));
    return (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v), d) + pctSep();
  };
  const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => (n < 0 ? "−" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
  const signedMoney = (n) => (n > 0 ? "+" : "") + money(n);

  // lower = uvnitř věty (čeština a slovenština píšou měsíce malým písmenem)
  function monthName(key, withYear, lower) {
    const [y, m] = key.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    const s = d.toLocaleDateString(locale(), withYear ? { month: "long", year: "numeric" } : { month: "long" });
    return lower && lang() !== "en" ? s : s.charAt(0).toUpperCase() + s.slice(1);
  }
  const sportLabel = (k) => (typeof sportName === "function" ? sportName(k, k) : k);
  function tipLabel(t) {
    const s = sels(t);
    if (s.length > 1) return { match: trf("rc.combo", { n: s.length }), pick: "" };
    const x = s[0] || {};
    const match = x.homeTeam && x.awayTeam ? `${x.homeTeam} – ${x.awayTeam}` : (x.league || "");
    const market = typeof marketLabel === "function" && x.marketName ? marketLabel(x.marketName) : (x.marketName || "");
    return { match, pick: [market, x.pickLabel].filter(Boolean).join(" · ") };
  }

  // ------------------------------------------------------------------
  // vykreslení záložky
  // ------------------------------------------------------------------
  let selected = null;
  let lastStats = null;

  function deltaRow(label, v, goodWhenUp, asPp) {
    if (v === null || v === undefined) return "";
    const pp = v * 100;
    const r = Number(pp.toFixed(1));
    const cls = r === 0 ? "" : (r > 0) === goodWhenUp ? "green" : "red";
    const word = r === 0 ? tr("rc.same") : (r > 0) === goodWhenUp ? tr("rc.better") : tr("rc.worse");
    const val = (r > 0 ? "+" : r < 0 ? "−" : "") + (asPp ? trf("rc.pp", { v: fmt(Math.abs(r), 1) }) : fmt(Math.abs(r), 2) + pctSep());
    return `<div class="k-row neutral">${escH(label)}<span class="n ${cls}">${escH(val)} · ${escH(word)}</span></div>`;
  }

  function render() {
    const root = document.getElementById("recapRoot");
    if (!root || root.hidden) return;
    const state = typeof Portfolio !== "undefined" ? Portfolio.get() : null;
    const tickets = (state && state.tickets) || [];
    const cap = state && state.cap;
    const months = RecapCore.months(tickets);
    if (!months.length) {
      root.innerHTML = `<div class="panel an-empty"><h3>${escH(tr("rc.kicker"))}</h3><p>${escH(tr("rc.empty"))}</p></div>`;
      lastStats = null;
      return;
    }
    if (!selected || !months.includes(selected)) selected = months[0];
    const m = RecapCore.month(tickets, cap, selected);
    const prev = RecapCore.month(tickets, cap, RecapCore.shiftMonth(selected, -1));
    const cmp = RecapCore.compare(m, prev);
    const streak = RecapCore.disciplineStreak(tickets, cap);
    let worst = [];
    if (window.FundlyAnalytics && m.settledTickets.length) {
      try { worst = (window.FundlyAnalytics.compute(m.settledTickets, cap).insights || {}).worst || []; } catch (e) { worst = []; }
    }
    lastStats = { month: m, streak, label: monthName(selected, false), labelYear: monthName(selected, true) };

    const stat = (lbl, val, cls) => `<div class="dstat"><div class="lbl">${escH(lbl)}</div><div class="val ${cls || ""}">${escH(val)}</div></div>`;
    const chips = months.slice(0, 6).map((k) => `<button type="button" class="${k === selected ? "active" : ""}" data-rc-month="${k}" aria-pressed="${k === selected}">${escH(monthName(k, false))}</button>`).join("");

    let sportHtml;
    if (m.bestSport) {
      const s = m.bestSport;
      sportHtml = `<div class="rc-big">${escH(sportLabel(s.key))}</div>
        <p class="an-muted">${escH(trf("rc.bestSportLine", { roi: signedPct(s.roi), tips: trp("rc.tipsN", s.n), wr: plainPct(s.winRate) }))}</p>`;
    } else sportHtml = `<p class="an-muted">${escH(trf("rc.bestSportNone", { min: MIN_SPORT }))}</p>`;

    let tipHtml;
    if (m.bestTip) {
      const l = tipLabel(m.bestTip.ticket);
      tipHtml = `<div class="rc-big">${escH(l.match)}</div>
        <p class="an-muted">${escH([l.pick, trf("rc.oddsLabel", { odds: fmt(m.bestTip.odds, 2) })].filter(Boolean).join(" · "))}</p>
        <p class="rc-tip-net green">${escH(signedMoney(m.bestTip.net))}</p>`;
    } else tipHtml = `<p class="an-muted">${escH(tr("rc.bestTipNone"))}</p>`;

    let loseHtml = `<p class="an-muted">${escH(tr("rc.whereLoseNone"))}</p>`;
    if (worst.length && window.FundlyAnalytics && typeof window.FundlyAnalytics.insightText === "function") {
      loseHtml = `<ul class="an-ins worst">${worst.slice(0, 3).map((s) => `<li>${window.FundlyAnalytics.insightText(s, "worst")}</li>`).join("")}</ul>`;
    }

    const cmpHtml = cmp
      ? `<div class="k-rows">
          ${deltaRow(tr("rc.cmpWinRate"), cmp.winRate, true, true)}
          ${deltaRow(tr("rc.cmpRoi"), cmp.roi, true, true)}
          ${deltaRow(tr("rc.cmpDisc"), cmp.discShare, true, true)}
          ${deltaRow(tr("rc.cmpStake"), cmp.avgStakePct, false, false)}
        </div>`
      : `<p class="an-muted">${escH(tr("rc.vsPrevNone"))}</p>`;

    const kv = (k, v) => `<div class="k-row neutral">${escH(k)}<span class="n">${escH(v)}</span></div>`;
    root.innerHTML = `
      ${months.length > 1 ? `<div class="rc-months subtabs" role="group" aria-label="${escH(tr("rc.monthsLabel"))}">${chips}</div>` : ""}
      <div class="panel rc-hero">
        <div class="rc-hero-top">
          <div>
            <div class="rc-kicker">${escH(tr("rc.kicker"))}</div>
            <h2 class="rc-title">${escH(monthName(selected, true))}</h2>
          </div>
          <button type="button" class="btn btn-primary" data-share="month">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 9V1.5M4 4.5l3-3 3 3M2.5 8v3.5h9V8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>${escH(tr("rc.share"))}</span>
          </button>
        </div>
        <div class="stat-grid" style="margin-top:14px">
          ${stat(tr("rc.tips"), String(m.tips))}
          ${stat(tr("rc.winRate"), plainPct(m.winRate), m.winRate !== null && m.winRate >= 0.5 ? "green" : "")}
          ${stat(tr("rc.roi"), signedPct(m.roi), m.roi > 0 ? "green" : m.roi < 0 ? "red" : "")}
          ${stat(tr("rc.profit"), signedPct(m.profitPct, 2), m.net > 0 ? "green" : m.net < 0 ? "red" : "")}
        </div>
      </div>
      <div class="two-col">
        <div class="panel"><h3>${escH(tr("rc.bestSport"))}</h3>${sportHtml}</div>
        <div class="panel"><h3>${escH(tr("rc.bestTip"))}</h3>${tipHtml}</div>
      </div>
      <div class="two-col">
        <div class="panel an-lose"><h3>${escH(tr("rc.whereLose"))}</h3>${loseHtml}</div>
        <div class="panel"><h3>${escH(trf("rc.vsPrev", { month: monthName(RecapCore.shiftMonth(selected, -1), false, true) }))}</h3>${cmpHtml}</div>
      </div>
      <div class="panel">
        <h3>${escH(tr("rc.discipline"))}</h3>
        <div class="k-rows">
          ${kv(tr("rc.streakNow"), `${trp("rc.streakDays", streak.current)} · ${trf("rc.streakBest", { n: streak.best })}`)}
          ${kv(tr("rc.activeDays"), String(m.activeDays))}
          ${kv(tr("rc.discDays"), `${m.disciplinedDays} / ${m.activeDays}`)}
          ${kv(tr("rc.discShare"), plainPct(m.discShare))}
          ${kv(tr("rc.avgStake"), m.avgStakePct === null ? "–" : fmt(m.avgStakePct * 100, 2) + pctSep())}
          ${kv(tr("rc.bestRun"), String(m.bestRun))}
          ${kv(tr("rc.notes"), String(m.notes))}
        </div>
        <p class="an-muted" style="margin-top:10px">${escH(tr("rc.discHelp"))}</p>
      </div>`;
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-rc-month]");
    if (!b) return;
    selected = b.dataset.rcMonth;
    render();
  });
  document.addEventListener("fundly:lang-changed", () => render());

  window.FundlyRecap = {
    core: RecapCore,
    render,
    current: () => lastStats,
    monthName,
    // pro sdílecí kartu: aktuálně vybraný měsíc (nebo nejnovější)
    monthForShare() {
      const state = typeof Portfolio !== "undefined" ? Portfolio.get() : null;
      const tickets = (state && state.tickets) || [];
      const months = RecapCore.months(tickets);
      const key = selected && months.includes(selected) ? selected : months[0];
      if (!key) return null;
      return { month: RecapCore.month(tickets, state.cap, key), streak: RecapCore.disciplineStreak(tickets, state.cap), label: monthName(key, false), labelYear: monthName(key, true) };
    },
    isCsLike,
    plural: trp,
  };
})();
