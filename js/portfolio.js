/* Fundly — sdílená API/cache vrstva pro odds-api.io + stav portfolia
   (balíček, zůstatek, tikety). Načítá se před dashboard.js (a main.js),
   obojí sdílí tyto globální funkce/objekty. */

const API_BASE = "https://api.odds-api.io/v3";
// POZOR: klíč je v klientském JS viditelný, pro produkci patří za vlastní proxy.
const API_KEY = "6fb7b78e922814fe15b9486cfa98c42596ab7a4035c5b278989af88d3a386080";
const BOOKMAKER = "Betano";
const CACHE_TTL = 5 * 60 * 1000; // 5 min, free tier má 100 requestů/hod

function cacheGet(key, ttl) {
  try {
    const raw = localStorage.getItem("bf2:" + key);
    if (!raw) return null;
    const { t, d } = JSON.parse(raw);
    if (Date.now() - t > (ttl || CACHE_TTL)) return null;
    return d;
  } catch (e) { return null; }
}
function cacheSet(key, d) {
  try { localStorage.setItem("bf2:" + key, JSON.stringify({ t: Date.now(), d })); } catch (e) {}
}
function cacheDrop(key) {
  try { localStorage.removeItem("bf2:" + key); } catch (e) {}
}

async function apiGet(path, params) {
  const q = new URLSearchParams({ ...params, apiKey: API_KEY });
  const res = await fetch(`${API_BASE}${path}?${q}`);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ---------- value-bet detection (forbidden strategy flag) ----------
// odds-api /value-bets pro Betano — cache 5 min ve sdílené cache vrstvě.
// Endpoint je volitelný: při jakékoli chybě vrátíme prázdné pole a
// flagování se tiše přeskočí.
async function fetchValueBets() {
  const key = "value-bets:" + BOOKMAKER;
  const cached = cacheGet(key, CACHE_TTL);
  if (cached) return cached;
  try {
    const data = await apiGet("/value-bets", { bookmaker: BOOKMAKER });
    cacheSet(key, data);
    return data;
  } catch (e) {
    return [];
  }
}

// Matches a slip selection against the value-bet list (same event, ML, same
// side). Payload shape is read defensively — the docs don't pin field names.
function isValueBetSelection(valueBets, sel) {
  if (!sel || sel.marketName !== "ML") return false;
  const list = Array.isArray(valueBets) ? valueBets : (valueBets && valueBets.data) || [];
  return list.some((vb) => {
    const evId = vb.id ?? vb.event_id ?? vb.eventId;
    if (String(evId) !== String(sel.eventId)) return false;
    const market = vb.market ?? vb.market_name ?? vb.marketName ?? "ML";
    if (market && String(market).toLowerCase() !== "ml") return false;
    const side = vb.side ?? vb.field ?? vb.outcome ?? vb.pick ?? null;
    return side ? String(side).toLowerCase() === String(sel.field).toLowerCase() : true;
  });
}

const Portfolio = (() => {
  const STORAGE_KEY = "bf2:portfolio";

  function get() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function save(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function init(packageKey) {
    const pkg = packageByKey(packageKey);
    const meta = packageMeta(pkg);
    const now = new Date().toISOString();
    const state = {
      packageKey: pkg.key,
      packageName: pkg.name,
      cap: pkg.cap,
      price: pkg.price,
      target1: meta.target1,
      target2: meta.target2,
      drawdown: meta.drawdown,
      maxStake: meta.maxStake,
      profitSplit: meta.profitSplit,
      phase: 1,
      phaseBaseline: pkg.cap,
      phaseStartedAt: now,
      balance: pkg.cap,
      hwm: pkg.cap,
      tickets: [],
      equityHistory: [{ t: now, balance: pkg.cap }],
    };
    save(state);
    return state;
  }

  function ensure(defaultPackageKey) {
    return get() || init(defaultPackageKey);
  }

  function phaseTarget(state) {
    return state.phase === 1 ? state.target1 : state.phase === 2 ? state.target2 : 0;
  }

  function daysRemaining(state) {
    const started = new Date(state.phaseStartedAt).getTime();
    const elapsedDays = Math.floor((Date.now() - started) / 86400000);
    return Math.max(0, 30 - elapsedDays);
  }

  // STATICKÝ drawdown: pevný floor = kapitál − drawdown (10 %), nesouvisí
  // s high-water mark. remaining = kolik zbývá do spálení účtu.
  // (hwm vracíme dál jen kvůli konceptovým stránkám, hlavní dashboard ho
  // už nikde nezobrazuje.)
  function drawdownInfo(state) {
    const floor = state.cap - state.drawdown;
    const span = state.cap - floor;
    const pct = span > 0 ? Math.max(0, Math.min(100, ((state.balance - floor) / span) * 100)) : 100;
    return { hwm: state.hwm, floor, remaining: Math.max(0, state.balance - floor), pct };
  }

  // Kvalifikační tiket = výherný tiket s čistým ziskem (payout − stake)
  // ≥ 0,5 % kapitálu. sinceIso omezí počítání na aktuální fázi.
  function countQualifyingTickets(state, sinceIso) {
    const meta = packageMeta(packageByKey(state.packageKey));
    const minProfit = state.cap * (meta.qualifyingTicketProfitPct / 100);
    return state.tickets.filter((t) =>
      t.status === "won" &&
      (t.payout || 0) - t.stake >= minProfit &&
      (!sinceIso || (t.settledAt && t.settledAt >= sinceIso))
    ).length;
  }

  function summary(state) {
    const settled = state.tickets.filter((t) => t.status !== "pending");
    const won = settled.filter((t) => t.status === "won").length;
    const lost = settled.filter((t) => t.status === "lost").length;
    const pending = state.tickets.filter((t) => t.status === "pending").length;
    const staked = state.tickets.reduce((a, t) => a + t.stake, 0);
    const returned = state.tickets.reduce((a, t) => a + (t.payout || 0), 0);
    const avgOdds = state.tickets.length
      ? state.tickets.reduce((a, t) => a + t.combinedOdds, 0) / state.tickets.length
      : 0;
    const winRate = won + lost ? Math.round((won / (won + lost)) * 100) : 0;
    return { won, lost, pending, staked, returned, netProfit: returned - staked, avgOdds, winRate, total: state.tickets.length };
  }

  function dailyNet(state, days) {
    const buckets = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      buckets.push({ key: d.toDateString(), label: d.toLocaleDateString("en-US", { weekday: "short" }), net: 0 });
    }
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
    state.tickets
      .filter((t) => t.status === "won" || t.status === "lost" || t.status === "push")
      .forEach((t) => {
        const key = new Date(t.settledAt).toDateString();
        if (!byKey[key]) return;
        byKey[key].net += (t.payout || 0) - t.stake;
      });
    return buckets;
  }

  // Arbitrage / sure-bet detection (jen flag, sázku neblokuje):
  // více výběrů na stejný zápas v jednom tiketu, nebo protikladná strana
  // téhož trhu už leží v jiném čekajícím tiketu.
  function detectArbitrage(selections, state) {
    const byEvent = {};
    selections.forEach((s) => {
      (byEvent[s.eventId] = byEvent[s.eventId] || []).push(s);
    });
    if (Object.values(byEvent).some((list) => list.length > 1)) return true;
    return state.tickets.some((t) =>
      t.status === "pending" && t.selections.some((ps) =>
        selections.some((s) =>
          s.eventId === ps.eventId && s.marketName === ps.marketName && s.field !== ps.field)));
  }

  function placeBet(selections, stake, extraFlags) {
    const state = get();
    if (!state) return { ok: false, error: "Please sign in first." };
    if (!selections || !selections.length) return { ok: false, error: "Your ticket is empty." };
    const amount = Number(stake);
    if (!amount || amount <= 0) return { ok: false, error: "Enter a valid stake amount." };
    if (amount > state.maxStake) return { ok: false, error: `Max. stake is $${state.maxStake.toLocaleString("en-US")}.` };
    if (amount > state.balance) return { ok: false, error: "Insufficient balance." };

    // flagy zakázaných strategií (value z dashboard.js, arbitrage zde)
    const flags = [...new Set([
      ...(extraFlags || []),
      ...(detectArbitrage(selections, state) ? ["arbitrage"] : []),
    ])];

    const combinedOdds = selections.reduce((acc, s) => acc * s.oddValue, 1);
    const now = new Date().toISOString();
    const ticket = {
      id: `t${Date.now()}`,
      placedAt: now,
      stake: amount,
      combinedOdds,
      status: "pending",
      settledAt: null,
      payout: null,
      selections: selections.map((s) => ({
        eventId: s.eventId,
        sport: s.sport,
        league: s.league,
        homeTeam: s.homeTeam,
        awayTeam: s.awayTeam,
        startTime: s.startTime,
        marketName: s.marketName,
        field: s.field,
        hdp: s.hdp,
        oddValue: s.oddValue,
        pickLabel: s.pickLabel,
      })),
    };
    if (flags.length) ticket.flags = flags;
    state.balance -= amount;
    state.tickets.unshift(ticket);
    state.equityHistory.push({ t: now, balance: state.balance });
    save(state);
    return { ok: true, ticket };
  }

  // Vyhodnotí jeden výběr tiketu podle finálního skóre zápasu (home/away).
  // Trhy, které neumíme spolehlivě vyhodnotit z dostupných dat, vrací "push"
  // (vklad se vrátí) místo hádání výsledku.
  function settleSelection(sel, finalHome, finalAway) {
    const total = finalHome + finalAway;
    switch (sel.marketName) {
      case "ML": {
        if (finalHome === finalAway) return sel.field === "draw" ? "won" : "lost";
        const winner = finalHome > finalAway ? "home" : "away";
        return sel.field === winner ? "won" : "lost";
      }
      case "Totals":
      case "Goals Over/Under": {
        if (sel.hdp === undefined || sel.hdp === null) return "push";
        if (total === sel.hdp) return "push";
        const over = total > sel.hdp;
        if (sel.field === "over") return over ? "won" : "lost";
        if (sel.field === "under") return !over ? "won" : "lost";
        return "push";
      }
      case "Both Teams To Score": {
        const btts = finalHome > 0 && finalAway > 0;
        if (sel.field === "yes") return btts ? "won" : "lost";
        if (sel.field === "no") return !btts ? "won" : "lost";
        return "push";
      }
      case "Spread": {
        // Zjednodušení: hdp aplikujeme na domácí tým. Funguje přesně pro
        // celé/poloviční linie; čtvrtinové linie (.25/.75) vrací jeden
        // win/loss místo rozděleného vypořádání.
        if (sel.hdp === undefined || sel.hdp === null) return "push";
        const adjHome = finalHome + sel.hdp;
        if (adjHome === finalAway) return "push";
        const winner = adjHome > finalAway ? "home" : "away";
        return sel.field === winner ? "won" : "lost";
      }
      default:
        return "push";
    }
  }

  const FAILED_LOOKUP = "__failed__"; // sentinel: cacheGet can't tell "no entry" apart from a cached null
  async function fetchEventStatus(id) {
    const cached = cacheGet("eventStatus:" + id, 2 * 60 * 1000);
    if (cached === FAILED_LOOKUP) return null;
    if (cached !== null) return cached;
    try {
      const ev = await apiGet(`/events/${id}`, {});
      cacheSet("eventStatus:" + id, ev);
      return ev;
    } catch (e) {
      cacheSet("eventStatus:" + id, FAILED_LOOKUP); // negative-cache the failure so we don't retry every tick
      return null;
    }
  }

  function advancePhaseIfNeeded(state) {
    if (state.phase === "funded") return;
    const target = phaseTarget(state);
    const profit = state.balance - state.phaseBaseline;
    const meta = packageMeta(packageByKey(state.packageKey));
    // postup = splněný cíl zisku + min. počet kvalifikačních tiketů v této fázi
    const qualified = countQualifyingTickets(state, state.phaseStartedAt) >= meta.qualifyingTickets;
    if (profit >= target && qualified) {
      state.phase = state.phase === 1 ? 2 : "funded";
      state.phaseBaseline = state.balance;
      state.phaseStartedAt = new Date().toISOString();
    }
  }

  async function checkSettlements() {
    const state = get();
    if (!state) return null;
    const now = Date.now();
    const pending = state.tickets.filter((t) => t.status === "pending");
    if (!pending.length) return state;

    const dueEventIds = new Set();
    pending.forEach((t) => t.selections.forEach((s) => {
      if (new Date(s.startTime).getTime() <= now) dueEventIds.add(s.eventId);
    }));
    if (!dueEventIds.size) return state;

    const statuses = {};
    for (const id of dueEventIds) {
      statuses[id] = await fetchEventStatus(id);
    }

    let changed = false;
    pending.forEach((ticket) => {
      const results = ticket.selections.map((s) => {
        const ev = statuses[s.eventId];
        if (!ev || ev.status !== "settled") return null;
        const ft = (ev.scores && ev.scores.periods && ev.scores.periods.ft) || ev.scores;
        if (!ft || typeof ft.home !== "number" || typeof ft.away !== "number") return "push";
        return settleSelection(s, ft.home, ft.away);
      });
      if (results.some((r) => r === null)) return;

      changed = true;
      const settledAt = new Date().toISOString();
      let payout = 0;
      if (results.includes("lost")) {
        ticket.status = "lost";
      } else if (results.every((r) => r === "push")) {
        ticket.status = "push";
        payout = ticket.stake;
      } else {
        ticket.status = "won";
        const factor = ticket.selections.reduce(
          (acc, s, i) => acc * (results[i] === "push" ? 1 : s.oddValue), 1);
        payout = Math.round(ticket.stake * factor);
      }
      ticket.settledAt = settledAt;
      ticket.payout = payout;
      state.balance += payout;
      if (state.balance > state.hwm) state.hwm = state.balance;
      state.equityHistory.push({ t: settledAt, balance: state.balance });
    });

    if (changed) {
      advancePhaseIfNeeded(state);
      save(state);
    }
    return state;
  }

  return {
    init, get, save, ensure, phaseTarget, daysRemaining, drawdownInfo,
    summary, dailyNet, placeBet, checkSettlements, countQualifyingTickets,
  };
})();
