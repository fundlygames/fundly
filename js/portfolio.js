/* Fundly — sdílená API/cache vrstva pro odds-api.io + stav portfolia
   (balíček, zůstatek, tikety). Načítá se před dashboard.js (a main.js),
   obojí sdílí tyto globální funkce/objekty. */

const API_BASE = "https://api.odds-api.io/v3";
// POZOR: klíč je v klientském JS viditelný, pro produkci patří za vlastní proxy.
const API_KEY = "ce3091bbbb4c283c68c0d51cee36f37bd259db6d6931c81ec214e518cb79ae0b";
// Plán odds-api.io je omezený na max 2 bookmakery zvolené na účtu (Bet365 +
// Sportsbet.com.au) — pár sportů (hokej, MMA, volejbal) u obou nemá vůbec
// žádná data, to je limit datového zdroje, ne chyba kódu. BOOKMAKERS je
// prioritní seznam pro fallback (loadSportEvents v dashboard.js), BOOKMAKER
// zůstává pro místa, co čekají jediný bookmaker (value-bets endpoint).
const BOOKMAKERS = ["Bet365", "Sportsbet.com.au"];
const BOOKMAKER = BOOKMAKERS[0];
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

  // Pozn.: sem se záměrně NEukládají odvozené hodnoty pravidel (cíle, max.
  // ztráta, max. sázka, profit split) — ty se vždy počítají čerstvě přes
  // ruleMeta() z aktuálního packages.js. Kdyby se sem znovu přidaly a někde
  // se z nich zase četlo, vrátí se přesně tenhle bug (staré účty by navždy
  // běžely na pravidlech platných v den založení).
  function init(packageKey) {
    const pkg = packageByKey(packageKey);
    const now = new Date().toISOString();
    const state = {
      packageKey: pkg.key,
      packageName: pkg.name,
      cap: pkg.cap,
      price: pkg.price,
      phase: 1,
      phaseBaseline: pkg.cap,
      phaseStartedAt: now,
      balance: pkg.cap,
      hwm: pkg.cap,
      dayStartDate: now.slice(0, 10), // UTC den pro denní limit ztráty
      dayStartBalance: pkg.cap,
      lastPayoutAt: null, // kvalifikační tikety se před každým payoutem resetují
      tickets: [],
      equityHistory: [{ t: now, balance: pkg.cap }],
    };
    save(state);
    return state;
  }

  function ensure(defaultPackageKey) {
    return get() || init(defaultPackageKey);
  }

  // Jediný zdroj pravdy pro odvozená pravidla (cíle, max. ztráta, denní
  // limit, max. sázka, profit split) — VŽDY počítáno čerstvě z aktuálního
  // packageMeta(), nikdy z hodnot zamrzlých na účtu při jeho založení.
  // Díky tomu se každá úprava procent v packages.js promítne i do účtů
  // založených dřív (dřív se používaly hodnoty uložené v state.* a při
  // změně pravidel v kódu zůstaly staré účty navždy na starých číslech —
  // proto se mohlo stát, že denní ztráta vyšla vyšší než celková).
  function ruleMeta(state) {
    return packageMeta(packageByKey(state.packageKey));
  }

  function phaseTarget(state) {
    const meta = ruleMeta(state);
    return state.phase === 1 ? meta.target1 : state.phase === 2 ? meta.target2 : 0;
  }

  function daysRemaining(state) {
    const started = new Date(state.phaseStartedAt).getTime();
    const elapsedDays = Math.floor((Date.now() - started) / 86400000);
    return Math.max(0, 30 - elapsedDays);
  }

  // Max. celková ztráta: ve fázích 1–2 STATICKÁ (pevný floor = kapitál − 10 %),
  // na funded účtu TRAILING (floor = high-water mark − 10 % kapitálu).
  // remaining = kolik zbývá do spálení účtu.
  function drawdownInfo(state) {
    const meta = ruleMeta(state);
    const trailing = state.phase === "funded";
    const floor = trailing ? state.hwm - meta.drawdown : state.cap - meta.drawdown;
    const span = (trailing ? state.hwm : state.cap) - floor;
    const pct = span > 0 ? Math.max(0, Math.min(100, ((state.balance - floor) / span) * 100)) : 100;
    return { hwm: state.hwm, floor, trailing, remaining: Math.max(0, state.balance - floor), pct, limit: meta.drawdown };
  }

  // Max. denní ztráta −4 % kapitálu. Start dne se fixuje na první přístup
  // v daném UTC dni (reset o půlnoci UTC), loss = pokles od startu dne.
  function dailyLossInfo(state) {
    const today = new Date().toISOString().slice(0, 10);
    if (state.dayStartDate !== today) {
      state.dayStartDate = today;
      state.dayStartBalance = state.balance;
      save(state);
    }
    const meta = ruleMeta(state);
    const limit = meta.dailyLoss;
    const loss = Math.max(0, (state.dayStartBalance ?? state.cap) - state.balance);
    return { limit, loss, remaining: Math.max(0, limit - loss) };
  }

  // Porušení pravidel: celková ztráta pod floor (statický / trailing dle fáze)
  // nebo denní ztráta nad limitem. Jen detekce — žádné blokování.
  function breachInfo(state) {
    const dd = drawdownInfo(state);
    if (state.balance <= dd.floor) {
      return {
        breached: true,
        reason: dd.trailing
          ? "Max. loss exceeded (trailing -10 %)"
          : "Max. loss exceeded (static -10 %)",
      };
    }
    const dl = dailyLossInfo(state);
    if (dl.loss > dl.limit) {
      return { breached: true, reason: "Max. daily loss exceeded (-4 %)" };
    }
    return { breached: false, reason: null };
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
      .filter((t) => t.status === "won" || t.status === "lost" || t.status === "push" || t.status === "cashedout")
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

  // Už existuje čekající tiket se sázkou na tenhle zápas? (jakýkoli trh/strana)
  // Blokuje víc aktivních sázek na stejný event, dokud se ten předchozí nevyhodnotí.
  function hasPendingBetOnEvent(state, eventId) {
    return state.tickets.some((t) =>
      t.status === "pending" && t.selections.some((s) => s.eventId === eventId));
  }

  // Open exposure = součet vkladů všech aktuálně čekajících tiketů. Balance
  // se mění jen při vypořádání, takže samotná stávka na balance "nesahá" —
  // proto se otevřená expozice musí počítat zvlášť pro worst-case kontrolu.
  function openExposure(state) {
    return state.tickets
      .filter((t) => t.status === "pending")
      .reduce((a, t) => a + t.stake, 0);
  }

  // Worst-case kontrola expozice: kdyby v tomto okamžiku prohrály úplně
  // všechny čekající tikety (+ ten, co se právě zadává), nesmí to podkročit
  // ani denní, ani celkový limit. Blokuje obcházení limitů podáním víc
  // tiketů souběžně, než se první stihne vyhodnotit.
  function worstCaseInfo(state, newStake) {
    const exposure = openExposure(state);
    const worstCaseBalance = state.balance - exposure - (newStake || 0);
    const trailing = state.phase === "funded";
    const dailyFloor = (state.dayStartBalance ?? state.cap) * (1 - 0.04);
    const totalFloor = (trailing ? state.hwm : state.cap) * (1 - 0.10);
    return { exposure, worstCaseBalance, dailyFloor, totalFloor, trailing };
  }

  // Consistency rule: jeden tiket nesmí tvořit víc než 40 % z cíle zisku
  // aktuální fáze (fáze 1/2), nebo z profit bufferu (+5 % kapitálu) na
  // funded účtu, kde žádný jiný pevný "cíl" k dispozici není.
  function consistencyLimit(state) {
    const meta = packageMeta(packageByKey(state.packageKey));
    if (state.phase === "funded") return state.cap * (meta.payoutBufferPct / 100) * 0.4;
    return phaseTarget(state) * 0.4;
  }

  function placeBet(selections, stake, extraFlags) {
    const state = get();
    if (!state) return { ok: false, error: "Please sign in first." };
    if (!selections || !selections.length) return { ok: false, error: "Your ticket is empty." };
    const amount = Number(stake);
    if (!amount || amount <= 0) return { ok: false, error: "Enter a valid stake amount." };
    const maxStake = ruleMeta(state).maxStake;
    if (amount > maxStake) return { ok: false, error: `Max. stake is $${maxStake.toLocaleString("en-US")}.` };
    if (amount > state.balance) return { ok: false, error: "Insufficient balance." };
    const seenEventIds = new Set();
    for (const s of selections) {
      if (seenEventIds.has(s.eventId)) {
        return { ok: false, error: "You can only include a match once per ticket." };
      }
      seenEventIds.add(s.eventId);
    }
    if (selections.some((s) => hasPendingBetOnEvent(state, s.eventId))) {
      return { ok: false, error: "You already have a pending bet on this match. Wait for it to settle before betting on it again." };
    }

    const combinedOdds = selections.reduce((acc, s) => acc * s.oddValue, 1);

    // Exposure-based worst-case check (viz zadání pravidel) — nahrazuje
    // holé porovnání s balance, počítá i s ostatními otevřenými tikety.
    // Je to jen varování, ne blokace: hráč smí vsadit i přes riziko
    // breach, ale musí o něm vědět předem (na žádost testera).
    const worst = worstCaseInfo(state, amount);
    const worstCaseWarning = (worst.worstCaseBalance < worst.dailyFloor || worst.worstCaseBalance < worst.totalFloor)
      ? "Heads up: if every open ticket lost, this bet would breach your loss limit and could burn the account."
      : null;

    // Consistency rule: potenciální čistý zisk jednoho tiketu ≤ 40 % z cíle.
    const potentialProfit = amount * (combinedOdds - 1);
    const capLimit = consistencyLimit(state);
    if (potentialProfit > capLimit) {
      return { ok: false, error: `A single ticket can't account for more than 40 % of the phase profit target (max potential profit here: $${Math.round(capLimit).toLocaleString("en-US")}).` };
    }

    // flagy zakázaných strategií (value z dashboard.js, arbitrage zde)
    const flags = [...new Set([
      ...(extraFlags || []),
      ...(detectArbitrage(selections, state) ? ["arbitrage"] : []),
    ])];
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
    return { ok: true, ticket, warning: worstCaseWarning };
  }

  // Early cashout čekajícího tiketu: pragmaticky 90 % vkladu (bez dat
  // o pohybu kurzů) — tiket se vyřadí z kvalifikačních (status "cashedout").
  function cashOut(ticketId) {
    const state = get();
    if (!state) return { ok: false, error: "Please sign in first." };
    const t = state.tickets.find((x) => x.id === ticketId);
    if (!t || t.status !== "pending") return { ok: false, error: "Ticket is no longer pending." };
    const amount = Math.round(t.stake * 0.9);
    t.status = "cashedout";
    t.settledAt = new Date().toISOString();
    t.payout = amount;
    state.balance += amount;
    if (state.balance > state.hwm) state.hwm = state.balance;
    state.equityHistory.push({ t: t.settledAt, balance: state.balance });
    save(state);
    return { ok: true, cashout: amount };
  }

  // Trhy seskupené podle toho, jaké skóre potřebují k vyhodnocení (FT =
  // celý zápas, HT = poločas/1. sada) a jaký typ sázky to je. Market, který
  // tu není zmíněný, se do nabídky vůbec nedostane (viz GRADEABLE_MARKETS
  // v dashboard.js) — nikdy tak nejde vsadit na trh, co bychom uměli jen
  // "tiše" vrátit jako push.
  const HT_MARKETS = new Set([
    "ML HT", "Half Time Result", "Totals HT", "Spread HT", "Odd/Even HT",
    "Double Chance HT", "Alternative 1st Half Goal Line", "Alternative 1st Half Asian Handicap",
  ]);
  const ML_MARKETS = new Set(["ML", "ML HT", "Half Time Result"]);
  const TOTALS_MARKETS = new Set([
    "Totals", "Goals Over/Under", "Totals HT",
    "Alternative Goal Line", "Alternative Total Goals", "Alternative 1st Half Goal Line",
  ]);
  const SPREAD_MARKETS = new Set([
    "Spread", "Spread HT", "Alternative Asian Handicap", "Alternative 1st Half Asian Handicap",
  ]);
  const ODD_EVEN_MARKETS = new Set(["Odd/Even", "Odd/Even HT", "Odd/Even 2H"]);
  const DOUBLE_CHANCE_MARKETS = new Set(["Double Chance", "Double Chance HT"]);

  // Vyhodnotí jeden výběr tiketu. `scores` = { ft: {home,away}, p1:
  // {home,away}|null } — p1 (poločas) je potřeba jen pro HT trhy a nemusí
  // být vždy k dispozici, pak se HT trh vrátí jako push (nikdy neuhádneme).
  // Trhy, které neumíme spolehlivě vyhodnotit, vrací "push" (vklad zpět)
  // místo hádání výsledku.
  function settleSelection(sel, scores) {
    const market = sel.marketName;
    const isHt = HT_MARKETS.has(market);
    const period = isHt ? scores.p1 : scores.ft;
    if (!period || typeof period.home !== "number" || typeof period.away !== "number") return "push";
    const finalHome = period.home, finalAway = period.away;
    const total = finalHome + finalAway;

    if (ML_MARKETS.has(market)) {
      if (finalHome === finalAway) return sel.field === "draw" ? "won" : "lost";
      const winner = finalHome > finalAway ? "home" : "away";
      return sel.field === winner ? "won" : "lost";
    }

    if (TOTALS_MARKETS.has(market)) {
      if (sel.hdp == null) return "push";
      if (total === sel.hdp) return "push";
      const over = total > sel.hdp;
      if (sel.field === "over") return over ? "won" : "lost";
      if (sel.field === "under") return !over ? "won" : "lost";
      return "push";
    }

    if (market === "Both Teams To Score") {
      const btts = finalHome > 0 && finalAway > 0;
      if (sel.field === "yes") return btts ? "won" : "lost";
      if (sel.field === "no") return !btts ? "won" : "lost";
      return "push";
    }

    if (SPREAD_MARKETS.has(market)) {
      // Zjednodušení: hdp aplikujeme na domácí tým. Funguje přesně pro
      // celé/poloviční linie; čtvrtinové linie (.25/.75) vrací jeden
      // win/loss místo rozděleného vypořádání.
      if (sel.hdp == null) return "push";
      const adjHome = finalHome + sel.hdp;
      if (adjHome === finalAway) return "push";
      const winner = adjHome > finalAway ? "home" : "away";
      return sel.field === winner ? "won" : "lost";
    }

    if (market === "European Handicap") {
      // Jako Spread, ale remíza po handicapu je platný 3. výsledek (draw),
      // ne push.
      if (sel.hdp == null) return "push";
      const adjHome = finalHome + sel.hdp;
      const winner = adjHome === finalAway ? "draw" : adjHome > finalAway ? "home" : "away";
      return sel.field === winner ? "won" : "lost";
    }

    if (market === "Draw No Bet") {
      if (finalHome === finalAway) return "push"; // remíza = vklad zpět
      const winner = finalHome > finalAway ? "home" : "away";
      return sel.field === winner ? "won" : "lost";
    }

    if (DOUBLE_CHANCE_MARKETS.has(market)) {
      const winner = finalHome === finalAway ? "draw" : finalHome > finalAway ? "home" : "away";
      const covers = { "1X": ["home", "draw"], "12": ["home", "away"], "X2": ["draw", "away"] };
      const set = covers[sel.field];
      if (!set) return "push";
      return set.includes(winner) ? "won" : "lost";
    }

    if (ODD_EVEN_MARKETS.has(market)) {
      // "2H" (druhý poločas) potřebuje FT i HT skóre zvlášť.
      let sum;
      if (market === "Odd/Even 2H") {
        if (!scores.p1 || typeof scores.p1.home !== "number") return "push";
        sum = (scores.ft.home - scores.p1.home) + (scores.ft.away - scores.p1.away);
      } else {
        sum = total;
      }
      const isOdd = Math.abs(sum) % 2 === 1;
      if (sel.field === "odd") return isOdd ? "won" : "lost";
      if (sel.field === "even") return !isOdd ? "won" : "lost";
      return "push";
    }

    return "push";
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
        const p1 = ev.scores && ev.scores.periods && ev.scores.periods.p1;
        return settleSelection(s, { ft, p1: p1 || null });
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

  // Server-side pojistka (settle-tickets cron) vyhodnotila tikety, i když
  // tahle karta nebyla otevřená — sync-tickets nám to vrátí, tady se to
  // promítne do lokálního zůstatku (stejná mechanika jako checkSettlements,
  // jen výsledek už spočítal server, ne my). Vrací pole nově vyřízených
  // tiketů (pro toast/konfety v dashboard.js), nebo null když nic nového.
  function applyServerSettlements(results) {
    const state = get();
    if (!state || !results || !results.length) return null;
    const newlySettled = [];
    results.forEach((r) => {
      const t = state.tickets.find((x) => x.id === r.id);
      if (!t || t.status !== "pending") return; // už vyřízeno lokálně, nebo neznámý tiket
      t.status = r.status;
      t.payout = r.payout || 0;
      t.settledAt = r.settledAt || new Date().toISOString();
      state.balance += t.payout;
      if (state.balance > state.hwm) state.hwm = state.balance;
      state.equityHistory.push({ t: t.settledAt, balance: state.balance });
      newlySettled.push(t);
    });
    if (!newlySettled.length) return null;
    advancePhaseIfNeeded(state);
    save(state);
    return newlySettled;
  }

  return {
    init, get, save, ensure, phaseTarget, daysRemaining, drawdownInfo, ruleMeta,
    dailyLossInfo, breachInfo, cashOut, openExposure, worstCaseInfo, consistencyLimit,
    summary, dailyNet, placeBet, checkSettlements, countQualifyingTickets,
    applyServerSettlements,
  };
})();
