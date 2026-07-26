# Functional Betting Simulation + Prop-Firm Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make betting on the static Betflow demo actually work client-side (buy package → real balance → place real bets → real settlement) and make `Přehled`/`Výkon` reflect that real state instead of hardcoded demo numbers.

**Architecture:** Two new plain `<script>` files (`js/packages.js`, `js/portfolio.js`) add a shared package config and a localStorage-backed portfolio module. `index.html`/`main.js` initialize the portfolio on signup; `dashboard.html`/`dashboard.js` place bets against it, poll odds-api.io to settle them against real match results, and render `Přehled`/`Výkon` from it instead of static markup.

**Tech Stack:** Vanilla HTML/CSS/JS, no build step, no framework, no test runner. `localStorage` for persistence. odds-api.io (`https://api.odds-api.io/v3`) for match data and results.

## Global Constraints

- No external JS libraries or chart libraries — the equity chart is hand-rolled inline SVG, matching the existing hand-rolled bar chart in Výkon.
- All persisted keys use the existing `bf1:` localStorage prefix convention.
- API response caching reuses the existing `cacheGet`/`cacheSet`/`cacheDrop` TTL-envelope pattern (`{t, d}` JSON wrapper).
- UI copy stays in Czech, matching existing tone.
- This project has **no git repository** — plan steps that would normally end in `git commit` instead end in a plain "done" checkpoint. Do not run `git init` as part of this plan unless the user asks.
- Verification is manual: start a local static server (`python3 -m http.server <port>` from `/Users/matejcaban/betflow-upcomers-static`) and drive the browser (or curl the odds-api.io endpoints directly) — there is no automated test suite in this project.
- Script load order matters (classic, non-module scripts share one global scope): `js/packages.js` → `js/portfolio.js` → `js/main.js` (on `index.html`) or `js/dashboard.js` (on `dashboard.html`). `packages.js` must never be loaded twice with conflicting `const` names — it's the single source of truth for `PACKAGES`.
- Known, accepted simplification (from the approved spec): Asian handicap settlement applies `hdp` to the home side and doesn't split quarter-lines (.25/.75) into half win/half loss — a single win/loss is returned instead. Markets the settlement logic doesn't confidently model (corners, correct score, half-time-specific markets) settle as `push` (stake refunded) rather than guessing.

---

### Task 1: Shared package config (`js/packages.js`)

**Files:**
- Create: `js/packages.js`
- Modify: `js/main.js:3-12` (remove local `PACKAGES` — now defined in `js/packages.js`)
- Modify: `index.html:352` (load `js/packages.js` before `js/main.js`)

**Interfaces:**
- Produces: global `PACKAGES` array (`{key, name, cap, price, top?}`), global `packageByKey(key) -> package`, global `packageMeta(pkg) -> {target1, target2, drawdown, maxStake, profitSplit}`. These are consumed by `js/portfolio.js` (Task 2) and continue to be consumed by the existing `js/main.js` picker code.

- [ ] **Step 1: Create `js/packages.js`**

```js
/* Betflow — sdílená konfigurace balíčků (index.html i dashboard.html). */

const PACKAGES = [
  { key: "starter",  name: "Starter",  cap: 10000,  price: 490 },
  { key: "standard", name: "Standard", cap: 25000,  price: 890 },
  { key: "advanced", name: "Advanced", cap: 50000,  price: 1590, top: true },
  { key: "pro",      name: "Pro",      cap: 100000, price: 2990 },
  { key: "elite",    name: "Elite",    cap: 200000, price: 4990 },
];

function packageByKey(key) {
  return PACKAGES.find((p) => p.key === key) || PACKAGES[2];
}

// Odvozené parametry výzvy ze zvoleného balíčku — stejné vzorce, jaké
// dnes používá price-card v main.js (cíl fáze 1 = 20 %, fáze 2 = 10 %,
// trailing drawdown = 8 %, max. vklad na tiket = 4 % kapitálu).
function packageMeta(pkg) {
  return {
    target1: Math.round(pkg.cap * 0.2),
    target2: Math.round(pkg.cap * 0.1),
    drawdown: Math.round(pkg.cap * 0.08),
    maxStake: Math.round(pkg.cap * 0.04),
    profitSplit: 85,
  };
}
```

- [ ] **Step 2: Remove the duplicate `PACKAGES` block from `js/main.js`**

In `js/main.js`, replace lines 1-12:

```js
/* Betflow × Upcomers — interakce */

// ---------- data balíčků ----------
// Advanced odpovídá přesně původnímu webu (cíl 20 %, drawdown 8 %,
// fáze 2 = 10 %, max vklad 4 % kapitálu), ostatní balíčky jsou škálované.
const PACKAGES = [
  { key: "starter",  name: "Starter",  cap: 10000,  price: 490 },
  { key: "standard", name: "Standard", cap: 25000,  price: 890 },
  { key: "advanced", name: "Advanced", cap: 50000,  price: 1590, top: true },
  { key: "pro",      name: "Pro",      cap: 100000, price: 2990 },
  { key: "elite",    name: "Elite",    cap: 200000, price: 4990 },
];
```

with:

```js
/* Betflow × Upcomers — interakce */

// data balíčků: viz js/packages.js (sdílené s dashboard.html)
```

- [ ] **Step 3: Load `js/packages.js` before `js/main.js` in `index.html`**

In `index.html`, replace line 352:

```html
  <script src="js/main.js"></script>
```

with:

```html
  <script src="js/packages.js"></script>
  <script src="js/main.js"></script>
```

- [ ] **Step 4: Verify in browser**

Run: `cd /Users/matejcaban/betflow-upcomers-static && python3 -m http.server 8791`
Open `http://localhost:8791/index.html`, scroll to "Vyberte si svůj kapitál", click through the 10K/25K/50K/100K/200K package chips.
Expected: pricing cards update exactly as before (same capitals/prices/targets) — this confirms `packages.js` loaded correctly and `main.js` reads `PACKAGES` from it with no console errors (check via right-click → Inspect → Console: no "PACKAGES is not defined" or duplicate-declaration errors).
Stop the server: `pkill -f "http.server 8791"`

- [ ] **Step 5: Done (no git repo — skip commit)**

---

### Task 2: Portfolio module + shared API/cache layer (`js/portfolio.js`)

**Files:**
- Create: `js/portfolio.js`
- Modify: `js/dashboard.js:39-95` (remove `API_BASE`, `API_KEY`, `BOOKMAKER`, `cacheGet`, `cacheSet`, `cacheDrop`, `apiGet` — now defined in `js/portfolio.js`; keep `MAX_STAKE`, `ODDS_MIN`, `ODDS_MAX`, `EVENTS_PER_SPORT`, `CACHE_TTL`, `SPORTS` as-is for now)
- Modify: `dashboard.html:536` (load `js/packages.js` and `js/portfolio.js` before `js/dashboard.js`)

**Interfaces:**
- Consumes: `PACKAGES`, `packageByKey`, `packageMeta` from `js/packages.js` (Task 1).
- Produces: globals `API_BASE`, `API_KEY`, `BOOKMAKER`, `cacheGet(key, ttl)`, `cacheSet(key, d)`, `cacheDrop(key)`, `apiGet(path, params) -> Promise<json>` (all consumed by `js/dashboard.js`'s existing match-listing code, unchanged call sites). Produces global `Portfolio` object with:
  `Portfolio.init(packageKey) -> state`, `Portfolio.get() -> state|null`, `Portfolio.ensure(defaultPackageKey) -> state`,
  `Portfolio.phaseTarget(state) -> number`, `Portfolio.daysRemaining(state) -> number`, `Portfolio.drawdownInfo(state) -> {hwm, floor, remaining, pct}`,
  `Portfolio.summary(state) -> {won, lost, pending, staked, returned, netProfit, avgOdds, winRate, total}`,
  `Portfolio.dailyNet(state, days) -> [{key, label, net}]`,
  `Portfolio.placeBet(selections, stake) -> {ok, error?, ticket?}`,
  `Portfolio.checkSettlements() -> Promise<state|null>`.
  These are consumed by `js/main.js` (Task 3) and `js/dashboard.js` (Tasks 4-7).

- [ ] **Step 1: Create `js/portfolio.js`**

```js
/* Betflow — sdílená API/cache vrstva pro odds-api.io + stav portfolia
   (balíček, zůstatek, tikety). Načítá se před dashboard.js (a main.js),
   obojí sdílí tyto globální funkce/objekty. */

const API_BASE = "https://api.odds-api.io/v3";
// POZOR: klíč je v klientském JS viditelný, pro produkci patří za vlastní proxy.
const API_KEY = "da7bd5cd5dc1335c1fe30d8c2dbb71f9aa6f5b4867691654d593b3b3a56dcb88";
const BOOKMAKER = "Bet365";

function cacheGet(key, ttl) {
  try {
    const raw = localStorage.getItem("bf1:" + key);
    if (!raw) return null;
    const { t, d } = JSON.parse(raw);
    if (Date.now() - t > ttl) return null;
    return d;
  } catch (e) { return null; }
}
function cacheSet(key, d) {
  try { localStorage.setItem("bf1:" + key, JSON.stringify({ t: Date.now(), d })); } catch (e) {}
}
function cacheDrop(key) {
  try { localStorage.removeItem("bf1:" + key); } catch (e) {}
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

const Portfolio = (() => {
  const STORAGE_KEY = "bf1:portfolio";

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

  function drawdownInfo(state) {
    const floor = state.hwm - state.drawdown;
    const span = state.hwm - floor;
    const pct = span > 0 ? Math.max(0, Math.min(100, ((state.balance - floor) / span) * 100)) : 100;
    return { hwm: state.hwm, floor, remaining: Math.max(0, state.balance - floor), pct };
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
      buckets.push({ key: d.toDateString(), label: d.toLocaleDateString("cs-CZ", { weekday: "short" }), net: 0 });
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

  function placeBet(selections, stake) {
    const state = get();
    if (!state) return { ok: false, error: "Nejprve se přihlaste." };
    if (!selections || !selections.length) return { ok: false, error: "Tiket je prázdný." };
    const amount = Number(stake);
    if (!amount || amount <= 0) return { ok: false, error: "Zadejte platnou výši vkladu." };
    if (amount > state.maxStake) return { ok: false, error: `Max. vklad je ${state.maxStake.toLocaleString("cs-CZ")} Kč.` };
    if (amount > state.balance) return { ok: false, error: "Nedostatečný zůstatek." };

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

  async function fetchEventStatus(id) {
    const cached = cacheGet("eventStatus:" + id, 2 * 60 * 1000);
    if (cached) return cached;
    try {
      const ev = await apiGet(`/events/${id}`, {});
      cacheSet("eventStatus:" + id, ev);
      return ev;
    } catch (e) {
      return null;
    }
  }

  function advancePhaseIfNeeded(state) {
    if (state.phase === "funded") return;
    const target = phaseTarget(state);
    const profit = state.balance - state.phaseBaseline;
    if (profit >= target) {
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
    summary, dailyNet, placeBet, checkSettlements,
  };
})();
```

- [ ] **Step 2: Remove the now-duplicated API/cache block from `js/dashboard.js`**

In `js/dashboard.js`, replace lines 39-95:

```js
// ---------- sázení (živá data z odds-api.io) ----------
const MAX_STAKE = 8000;
const ODDS_MIN = 1.0;
const ODDS_MAX = 8.0;

const API_BASE = "https://api.odds-api.io/v3";
// POZOR: klíč je v klientském JS viditelný, pro produkci patří za vlastní proxy.
const API_KEY = "da7bd5cd5dc1335c1fe30d8c2dbb71f9aa6f5b4867691654d593b3b3a56dcb88";
const BOOKMAKER = "Bet365";
const EVENTS_PER_SPORT = 10; // /odds/multi bere max 10 eventů na 1 request
const CACHE_TTL = 5 * 60 * 1000; // 5 min, free tier má 100 requestů/hod

// sporty jako na původním dashboardu
const SPORTS = [
  ["basketball", "Basketbal", "basketbal"],
  ["football", "Fotbal", "fotbal"],
  ["ice-hockey", "Hokej", "hokej"],
  ["table-tennis", "Stolní tenis", "stolni-tenis"],
  ["tennis", "Tenis", "tenis"],
];

let activeSport = "basketball";
let slip = []; // {id, match, pick, odds}
let sportEvents = []; // načtené zápasy aktivního sportu
const filters = { q: "", date: "", league: "", odds: "", live: false, high: false };

const sportTabs = document.getElementById("sportTabs");
const matchList = document.getElementById("matchList");
const slipBody = document.getElementById("slipBody");

// -- cache přes localStorage --
function cacheGet(key, ttl) {
  try {
    const raw = localStorage.getItem("bf1:" + key);
    if (!raw) return null;
    const { t, d } = JSON.parse(raw);
    if (Date.now() - t > (ttl || CACHE_TTL)) return null;
    return d;
  } catch (e) { return null; }
}
function cacheSet(key, d) {
  try { localStorage.setItem("bf1:" + key, JSON.stringify({ t: Date.now(), d })); } catch (e) {}
}
function cacheDrop(key) {
  try { localStorage.removeItem("bf1:" + key); } catch (e) {}
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
```

with:

```js
// ---------- sázení (živá data z odds-api.io) ----------
// API_BASE/API_KEY/BOOKMAKER/cacheGet/cacheSet/cacheDrop/apiGet: viz js/portfolio.js
const MAX_STAKE = 8000;
const ODDS_MIN = 1.0;
const ODDS_MAX = 8.0;
const EVENTS_PER_SPORT = 10; // /odds/multi bere max 10 eventů na 1 request
const CACHE_TTL = 5 * 60 * 1000; // 5 min, free tier má 100 requestů/hod

// sporty jako na původním dashboardu
const SPORTS = [
  ["basketball", "Basketbal", "basketbal"],
  ["football", "Fotbal", "fotbal"],
  ["ice-hockey", "Hokej", "hokej"],
  ["table-tennis", "Stolní tenis", "stolni-tenis"],
  ["tennis", "Tenis", "tenis"],
];

let activeSport = "basketball";
let slip = []; // {id, match, pick, odds}
let sportEvents = []; // načtené zápasy aktivního sportu
const filters = { q: "", date: "", league: "", odds: "", live: false, high: false };

const sportTabs = document.getElementById("sportTabs");
const matchList = document.getElementById("matchList");
const slipBody = document.getElementById("slipBody");
```

- [ ] **Step 3: Load `js/packages.js` and `js/portfolio.js` before `js/dashboard.js` in `dashboard.html`**

In `dashboard.html`, replace line 536:

```html
  <script src="js/dashboard.js"></script>
```

with:

```html
  <script src="js/packages.js"></script>
  <script src="js/portfolio.js"></script>
  <script src="js/dashboard.js"></script>
```

- [ ] **Step 4: Verify regression — match listing still works**

Run: `cd /Users/matejcaban/betflow-upcomers-static && python3 -m http.server 8791`
Open `http://localhost:8791/dashboard.html`, click "Sázení" in the top nav.
Expected: real upcoming matches still load per sport tab (Basketbal/Fotbal/Hokej/Stolní tenis/Tenis), exactly as before — confirms `cacheGet`/`cacheSet`/`apiGet` still work for `dashboard.js` from their new home in `portfolio.js`. Check DevTools Console: no errors.

- [ ] **Step 5: Verify the Portfolio module directly via DevTools console**

With the same page open, in the browser DevTools console run:

```js
localStorage.removeItem("bf1:portfolio");
const s = Portfolio.init("elite");
console.log(s.cap, s.balance, s.target1, s.target2, s.drawdown, s.maxStake);
```

Expected output: `200000 200000 40000 20000 16000 8000` (Elite: cap 200 000, target1 = 20% = 40 000, target2 = 10% = 20 000, drawdown = 8% = 16 000, max stake = 4% = 8 000).

Then run:

```js
console.log(Portfolio.get().phase, Portfolio.drawdownInfo(s));
```

Expected: `1 {hwm: 200000, floor: 184000, remaining: 16000, pct: 100}`.

Then test settlement against the real, already-settled match confirmed earlier (`NK Maribor 3 : 0 NK Brinje Grosuplje`, id `72278396`):

```js
const st = Portfolio.get();
st.tickets.unshift({
  id: "test1", placedAt: new Date().toISOString(), stake: 1000, combinedOdds: 2.5,
  status: "pending", settledAt: null, payout: null,
  selections: [{ eventId: 72278396, sport: "football", league: "Slovenia - PrvaLiga",
    homeTeam: "NK Maribor", awayTeam: "NK Brinje Grosuplje",
    startTime: "2026-07-25T18:15:00Z", marketName: "ML", field: "home", hdp: undefined,
    oddValue: 2.5, pickLabel: "1" }],
});
Portfolio.save(st);
await Portfolio.checkSettlements();
console.log(Portfolio.get().tickets[0].status, Portfolio.get().tickets[0].payout, Portfolio.get().balance);
```

Expected: `"won" 2500 202500` — home won 3:0, the ML "home" pick settles as a win, payout = 1000 × 2.5 = 2500, balance goes from 200 000 to 202 500.

Stop the server: `pkill -f "http.server 8791"`

- [ ] **Step 6: Done (no git repo — skip commit)**

---

### Task 3: Wire package selection into the portfolio on signup (`index.html` / `js/main.js`)

**Files:**
- Modify: `js/main.js:268-276` (auth submit handler)

**Interfaces:**
- Consumes: `Portfolio.init(packageKey)`, `Portfolio.ensure(defaultPackageKey)` from Task 2. Consumes the existing `activeKey`/`authMode` variables already in `js/main.js`.

- [ ] **Step 1: Update the auth submit handler**

In `js/main.js`, replace lines 268-276:

```js
authForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!authForm.reportValidity()) return;
  authSubmit.disabled = true;
  authSubmit.textContent = authMode === "login" ? "Přihlašování…" : "Vytváření účtu…";
  setTimeout(() => {
    window.location.href = "dashboard.html";
  }, 700);
});
```

with:

```js
authForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!authForm.reportValidity()) return;
  authSubmit.disabled = true;
  authSubmit.textContent = authMode === "login" ? "Přihlašování…" : "Vytváření účtu…";
  setTimeout(() => {
    if (authMode === "register") {
      Portfolio.init(activeKey);
    } else {
      Portfolio.ensure(activeKey);
    }
    window.location.href = "dashboard.html";
  }, 700);
});
```

- [ ] **Step 2: Load `js/portfolio.js` on `index.html`**

In `index.html`, replace line 352-353 (from Task 1's edit):

```html
  <script src="js/packages.js"></script>
  <script src="js/main.js"></script>
```

with:

```html
  <script src="js/packages.js"></script>
  <script src="js/portfolio.js"></script>
  <script src="js/main.js"></script>
```

- [ ] **Step 3: Verify register flow sets the right starting capital**

Run: `cd /Users/matejcaban/betflow-upcomers-static && python3 -m http.server 8791`
Open `http://localhost:8791/index.html`, open DevTools console and clear state: `localStorage.removeItem("bf1:portfolio")`.
Scroll to "Vyberte si svůj kapitál", select the **10K** (Starter) chip, click "Koupit výzvu", fill in any email/password, submit.
Expected: redirected to `dashboard.html`. In DevTools console run `JSON.parse(localStorage.getItem("bf1:portfolio"))` — expect `cap: 10000, balance: 10000, packageKey: "starter", phase: 1, target1: 2000, maxStake: 400`.

- [ ] **Step 4: Verify login preserves existing state**

Still on `dashboard.html`, in console run `Portfolio.get().balance = 9500; Portfolio.save(Portfolio.get());` to simulate a bet having been placed. Navigate back to `index.html`, click "Přihlášení" (not "Koupit výzvu"), submit with any credentials.
Expected: redirected to `dashboard.html`, and `Portfolio.get().balance` is still `9500` (login did not reset progress).
Stop the server: `pkill -f "http.server 8791"`

- [ ] **Step 5: Done (no git repo — skip commit)**

---

### Task 4: Make "Vsadit" real + start the settlement loop (`js/dashboard.js`)

**Files:**
- Modify: `js/dashboard.js:355-374` (`resolvePick` — capture raw settlement fields)
- Modify: `js/dashboard.js:406-447` (`renderSlip` — dynamic max stake + real `Portfolio.placeBet` call)
- Modify: `js/dashboard.js:8-16` (`showView` — add render hooks for later tasks)
- Modify: `js/dashboard.js` (add a portfolio bootstrap block after the existing "přehled: pod-taby" section, i.e. after line 37)

**Interfaces:**
- Consumes: `Portfolio.ensure`, `Portfolio.placeBet`, `Portfolio.checkSettlements` from Task 2.
- Produces: enriched slip items with `eventId, sport, league, homeTeam, awayTeam, startTime, marketName, field, hdp, oddValue, pickLabel` (consumed by `Portfolio.placeBet` and, later, by `renderPrehled`/`renderVykon` in Tasks 5-7 via `Portfolio.get().tickets[].selections`).

- [ ] **Step 1: Extend `resolvePick` with raw settlement fields**

In `js/dashboard.js`, replace lines 355-374:

```js
function resolvePick(id) {
  const [eid, marketName, ri, field] = id.split("|");
  const m = sportEvents.find((x) => x.id === Number(eid));
  if (!m) return null;
  const mk = m.markets.find((x) => x.name === marketName);
  const row = mk && mk.odds[Number(ri)];
  if (!row) return null;
  const odds = parseFloat(row[field]);
  if (Number.isNaN(odds)) return null;
  let pick;
  if (marketName === "ML") {
    pick = PICK_LABELS[field] || field;
  } else if (row.label) {
    pick = `${marketLabel(marketName)}: ${row.label}`;
  } else {
    const hdp = row.hdp !== undefined ? ` ${row.hdp}` : "";
    pick = `${marketLabel(marketName)}${hdp}: ${PICK_LABELS[field] || field}`;
  }
  return { id, match: `${m.home} – ${m.away}`, pick, odds };
}
```

with:

```js
function resolvePick(id) {
  const [eid, marketName, ri, field] = id.split("|");
  const m = sportEvents.find((x) => x.id === Number(eid));
  if (!m) return null;
  const mk = m.markets.find((x) => x.name === marketName);
  const row = mk && mk.odds[Number(ri)];
  if (!row) return null;
  const odds = parseFloat(row[field]);
  if (Number.isNaN(odds)) return null;
  let pick;
  if (marketName === "ML") {
    pick = PICK_LABELS[field] || field;
  } else if (row.label) {
    pick = `${marketLabel(marketName)}: ${row.label}`;
  } else {
    const hdp = row.hdp !== undefined ? ` ${row.hdp}` : "";
    pick = `${marketLabel(marketName)}${hdp}: ${PICK_LABELS[field] || field}`;
  }
  return {
    id, match: `${m.home} – ${m.away}`, pick, odds,
    eventId: Number(eid),
    sport: activeSport,
    league: m.league,
    homeTeam: m.home,
    awayTeam: m.away,
    startTime: m.date,
    marketName,
    field,
    hdp: row.hdp,
    oddValue: odds,
    pickLabel: pick,
  };
}
```

- [ ] **Step 2: Make the bet slip use the real max stake and place real bets**

In `js/dashboard.js`, replace lines 406-447 (the whole `renderSlip` function):

```js
function renderSlip() {
  if (!slip.length) {
    slipBody.innerHTML = `<p class="slip-empty"><img src="assets/fan-1.jpg" alt="" />Váš tiket je prázdný.<br />Vyberte si kurzy z nabídky.</p>`;
    return;
  }
  const totalOdds = slip.reduce((a, s) => a * s.odds, 1);
  slipBody.innerHTML = `
    ${slip.map((s) => `
      <div class="slip-item">
        <span class="si-info">
          <span class="si-match">${s.match}</span><br />
          <span class="si-pick">Tip: ${s.pick}</span>
        </span>
        <span class="si-odds">${s.odds.toFixed(2)}</span>
        <button class="si-x" data-remove="${s.id}" aria-label="Odebrat">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>`).join("")}
    <div class="slip-total"><span>Celkový kurz</span><b>${totalOdds.toFixed(2)}</b></div>
    <div class="field">
      <label for="stakeInput">Vklad (max. ${czk(MAX_STAKE)})</label>
      <input class="input" id="stakeInput" type="number" min="100" max="${MAX_STAKE}" value="${Math.min(2000, MAX_STAKE)}" />
    </div>
    <div class="slip-total"><span>Možná výhra</span><b class="green" id="potWin"></b></div>
    <button class="btn btn-primary" style="width:100%" id="placeBet">Vsadit</button>
    <p class="auth-note mt" id="betNote" hidden></p>`;

  const stakeInput = document.getElementById("stakeInput");
  const potWin = document.getElementById("potWin");
  const updateWin = () => {
    let v = Math.min(Number(stakeInput.value) || 0, MAX_STAKE);
    potWin.textContent = czk(Math.round(v * totalOdds));
  };
  stakeInput.addEventListener("input", updateWin);
  updateWin();

  document.getElementById("placeBet").addEventListener("click", () => {
    const note = document.getElementById("betNote");
    note.textContent = "Designový náhled, sázky zatím nejsou připojené na backend.";
    note.hidden = false;
  });
}
```

with:

```js
function renderSlip() {
  if (!slip.length) {
    slipBody.innerHTML = `<p class="slip-empty"><img src="assets/fan-1.jpg" alt="" />Váš tiket je prázdný.<br />Vyberte si kurzy z nabídky.</p>`;
    return;
  }
  const portfolio = Portfolio.ensure("advanced");
  const maxStake = portfolio.maxStake;
  const totalOdds = slip.reduce((a, s) => a * s.odds, 1);
  slipBody.innerHTML = `
    ${slip.map((s) => `
      <div class="slip-item">
        <span class="si-info">
          <span class="si-match">${s.match}</span><br />
          <span class="si-pick">Tip: ${s.pick}</span>
        </span>
        <span class="si-odds">${s.odds.toFixed(2)}</span>
        <button class="si-x" data-remove="${s.id}" aria-label="Odebrat">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>`).join("")}
    <div class="slip-total"><span>Celkový kurz</span><b>${totalOdds.toFixed(2)}</b></div>
    <div class="field">
      <label for="stakeInput">Vklad (max. ${czk(maxStake)})</label>
      <input class="input" id="stakeInput" type="number" min="100" max="${maxStake}" value="${Math.min(2000, maxStake)}" />
    </div>
    <div class="slip-total"><span>Možná výhra</span><b class="green" id="potWin"></b></div>
    <button class="btn btn-primary" style="width:100%" id="placeBet">Vsadit</button>
    <p class="auth-note mt" id="betNote" hidden></p>`;

  const stakeInput = document.getElementById("stakeInput");
  const potWin = document.getElementById("potWin");
  const updateWin = () => {
    let v = Math.min(Number(stakeInput.value) || 0, maxStake);
    potWin.textContent = czk(Math.round(v * totalOdds));
  };
  stakeInput.addEventListener("input", updateWin);
  updateWin();

  document.getElementById("placeBet").addEventListener("click", () => {
    const note = document.getElementById("betNote");
    const btn = document.getElementById("placeBet");
    const result = Portfolio.placeBet(slip, Number(stakeInput.value));
    if (!result.ok) {
      note.textContent = result.error;
      note.hidden = false;
      return;
    }
    note.textContent = "Tiket přijat! Sledujte ho v Přehledu.";
    note.hidden = false;
    btn.disabled = true;
    setTimeout(() => {
      slip = [];
      renderMatches();
      renderSlip();
    }, 900);
  });
}
```

- [ ] **Step 3: Add render hooks to `showView` for the (not-yet-written) Přehled/Výkon renderers**

In `js/dashboard.js`, replace lines 8-16:

```js
function showView(name) {
  views.forEach((v) => {
    document.getElementById(`view-${v}`).hidden = v !== name;
  });
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  window.scrollTo({ top: 0, behavior: "instant" });
}
```

with:

```js
function showView(name) {
  views.forEach((v) => {
    document.getElementById(`view-${v}`).hidden = v !== name;
  });
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  window.scrollTo({ top: 0, behavior: "instant" });
  if (name === "prehled" && typeof renderPrehled === "function") renderPrehled();
  if (name === "vykon" && typeof renderVykon === "function") renderVykon();
}
```

- [ ] **Step 4: Add the portfolio bootstrap + settlement loop**

In `js/dashboard.js`, after line 37 (the closing `});` of the "přehled: pod-taby" `forEach` block) and before line 39 (`// ---------- sázení ...`), insert:

```js

// ---------- portfolio: nastartuje simulaci a průběžně vyhodnocuje tikety ----------
Portfolio.ensure("advanced");
async function refreshAfterSettlement() {
  await Portfolio.checkSettlements();
  if (typeof renderPrehled === "function") renderPrehled();
  if (typeof renderVykon === "function") renderVykon();
}
refreshAfterSettlement();
setInterval(refreshAfterSettlement, 60 * 1000);
```

- [ ] **Step 5: Verify placing a real bet end-to-end**

Run: `cd /Users/matejcaban/betflow-upcomers-static && python3 -m http.server 8791`
Open `http://localhost:8791/dashboard.html`, open DevTools console and run `localStorage.removeItem("bf1:portfolio")`, reload the page.
Go to "Sázení", pick any sport with matches, click an odd to add it to the slip, set a stake (e.g. 500), click "Vsadit".
Expected: note shows "Tiket přijat! Sledujte ho v Přehledu.", the slip clears after ~900ms. In console, run `JSON.parse(localStorage.getItem("bf1:portfolio")).tickets[0]` — expect a ticket with `status: "pending"`, correct `stake`, `selections[0].eventId/marketName/field/oddValue` populated, and `JSON.parse(localStorage.getItem("bf1:portfolio")).balance` reduced by the stake.

- [ ] **Step 6: Verify stake validation**

In the same slip, try a stake above the package's max (e.g. type 999999 into the stake field) and click "Vsadit".
Expected: note shows "Max. vklad je … Kč." and no ticket is added (balance unchanged).
Stop the server: `pkill -f "http.server 8791"`

- [ ] **Step 7: Done (no git repo — skip commit)**

---

### Task 5: Wire Přehled (Overview) to real portfolio data

**Files:**
- Modify: `dashboard.html:63-174` (`view-prehled` section — replace hardcoded numbers with JS-fillable containers)
- Modify: `js/dashboard.js` (add `renderPrehled()`)

**Interfaces:**
- Consumes: `Portfolio.ensure`, `Portfolio.phaseTarget`, `Portfolio.daysRemaining`, `Portfolio.drawdownInfo`, `Portfolio.summary` from Task 2; `czk` (already defined at `js/dashboard.js:3`); `ODDS_MIN`/`ODDS_MAX` (already defined).
- Produces: global function `renderPrehled()` (already referenced by `showView` and the bootstrap loop from Task 4; also called by Task 6's equity-chart/recent-tickets additions and consumed again in Task 7 for consistency, though Task 7 defines its own `renderVykon()`).

- [ ] **Step 1: Replace the hardcoded `view-prehled` markup**

In `dashboard.html`, replace lines 63-174:

```html
      <section class="dash-view" id="view-prehled">
        <div class="dash-head">
          <div>
            <h1>Přehled</h1>
            <p>Fáze 1 · Betflow výzva</p>
          </div>
          <span class="spacer"></span>
          <span class="chip-phase">Fáze 1</span>
        </div>

        <div class="balance-card">
          <div class="balance-top">
            <div>
              <div class="bc-plan">Balíček Elite</div>
              <div class="bc-amount">206 400 Kč</div>
              <div class="bc-sub">Aktuální zůstatek</div>
            </div>
            <span class="chip-phase">85 % podíl</span>
          </div>
          <div class="bc-goal">
            <div class="bc-goal-row"><span>Cíl fáze: <b>240 000 Kč</b></span><span><b>16 %</b></span></div>
            <div class="progress"><span style="width:16%"></span></div>
            <div class="bc-meta"><span>23 dní zbývá</span><span>Do cíle 33 600 Kč</span></div>
          </div>
        </div>

        <div class="stat-grid">
          <div class="dstat">
            <div class="lbl"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M1.5 11.5l4-4 3 3 5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Zisk</div>
            <div class="val green">+6 400 Kč</div>
          </div>
          <div class="dstat">
            <div class="lbl"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="7" r="2" fill="currentColor"/></svg>Do cíle</div>
            <div class="val">33 600 Kč</div>
          </div>
          <div class="dstat">
            <div class="lbl"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M4.5 2h6v4a3 3 0 01-6 0V2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.5 9v2.5M5 13h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>Výhry</div>
            <div class="val">4 <small>/ 10</small></div>
          </div>
          <div class="dstat">
            <div class="lbl"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2 5a1.5 1.5 0 001.5-1.5h8A1.5 1.5 0 0013 5v1.6a1.9 1.9 0 000 3.8V12a1.5 1.5 0 00-1.5 1.5h-8A1.5 1.5 0 002 12V5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" transform="translate(0,-1.2)"/></svg>Tikety</div>
            <div class="val">6</div>
          </div>
        </div>

        <button class="btn btn-primary btn-lg cta-bet" data-view-link="sazeni">Sázet teď</button>

        <div class="subtabs" role="tablist" aria-label="Detail výzvy" id="ovTabs">
          <button class="active" data-ovtab="limity" role="tab" aria-selected="true">Limity</button>
          <button data-ovtab="pravidla" role="tab" aria-selected="false">Pravidla</button>
          <button data-ovtab="cesta" role="tab" aria-selected="false">Cesta</button>
          <button data-ovtab="tipy" role="tab" aria-selected="false">Tipy</button>
        </div>

        <div class="panel" data-ovpanel="limity">
          <div class="limit-row">
            <span class="k">Trailing drawdown <small>(HWM: 206 400 Kč)</small></span>
            <span class="v">16 000 Kč zbývá</span>
          </div>
          <div class="dd-bar">
            <span class="cap lo">Floor: 190 400</span>
            <span class="cursor" style="left:92%"></span>
            <span class="cap hi">206 400</span>
          </div>
        </div>

        <div class="panel" data-ovpanel="pravidla" hidden>
          <div class="rules-grid">
            <div class="rule-tile"><div class="k">Profit split</div><div class="v green">85 %</div></div>
            <div class="rule-tile"><div class="k">Max. sázka</div><div class="v">8 000 Kč</div></div>
            <div class="rule-tile"><div class="k">Kurzy</div><div class="v">1.00 až 8.00</div></div>
            <div class="rule-tile"><div class="k">Drawdown</div><div class="v">16 000 Kč</div></div>
            <div class="rule-tile"><div class="k">Časový limit</div><div class="v">30 dní / fáze</div></div>
            <div class="rule-tile"><div class="k">Min. tiketů</div><div class="v">10</div></div>
          </div>
        </div>

        <div class="panel" data-ovpanel="cesta" hidden>
          <div class="journey">
            <div class="j-step now">
              <div class="j-dot-col"><span class="j-dot">1</span><span class="j-line"></span></div>
              <div class="j-body">
                <img class="j-thumb" src="assets/card2-vyzva.jpg" alt="" />
                <span><span class="t">Fáze 1 · Betflow výzva</span><br /><span class="d">Cíl +40 000 Kč, právě probíhá. Máte 16 % splněno.</span></span>
              </div>
            </div>
            <div class="j-step">
              <div class="j-dot-col"><span class="j-dot">2</span><span class="j-line"></span></div>
              <div class="j-body">
                <img class="j-thumb" src="assets/card2-verifikace.jpg" alt="" />
                <span><span class="t">Fáze 2 · Verifikace</span><br /><span class="d">Cíl +20 000 Kč, potvrzení konzistence.</span></span>
              </div>
            </div>
            <div class="j-step">
              <div class="j-dot-col"><span class="j-dot">✓</span></div>
              <div class="j-body">
                <img class="j-thumb" src="assets/card2-tiper.jpg" alt="" />
                <span><span class="t">Financovaný účet</span><br /><span class="d">85 % podíl na zisku, neomezený čas, pravidelné výplaty.</span></span>
              </div>
            </div>
          </div>
        </div>

        <div class="panel" data-ovpanel="tipy" hidden>
          <ul class="tip-list">
            <li><svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Sázejte konzistentní částky, 1 až 2 % kapitálu na tiket bohatě stačí.</li>
            <li><svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Držte se sportů a lig, které opravdu znáte, kvantita cíl nesplní.</li>
            <li><svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Trailing drawdown se posouvá s každým novým maximem, hlídejte si rezervu.</li>
            <li><svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Na cíl máte 30 dní, nespěchejte. Průměrně stačí +1 400 Kč denně.</li>
          </ul>
        </div>
      </section>
```

with:

```html
      <section class="dash-view" id="view-prehled">
        <div class="dash-head">
          <div>
            <h1>Přehled</h1>
            <p id="ovSubtitle">Fáze 1 · Betflow výzva</p>
          </div>
          <span class="spacer"></span>
          <span class="chip-phase" id="ovPhaseChip">Fáze 1</span>
        </div>

        <div class="balance-card" id="balanceCard"><!-- JS: renderPrehled() --></div>

        <div class="stat-grid" id="ovStatGrid"><!-- JS: renderPrehled() --></div>

        <button class="btn btn-primary btn-lg cta-bet" data-view-link="sazeni">Sázet teď</button>

        <div class="subtabs" role="tablist" aria-label="Detail výzvy" id="ovTabs">
          <button class="active" data-ovtab="limity" role="tab" aria-selected="true">Limity</button>
          <button data-ovtab="pravidla" role="tab" aria-selected="false">Pravidla</button>
          <button data-ovtab="cesta" role="tab" aria-selected="false">Cesta</button>
          <button data-ovtab="tipy" role="tab" aria-selected="false">Tipy</button>
        </div>

        <div class="panel" data-ovpanel="limity" id="ovLimity"><!-- JS: renderPrehled() --></div>

        <div class="panel" data-ovpanel="pravidla" hidden id="ovPravidla"><!-- JS: renderPrehled() --></div>

        <div class="panel" data-ovpanel="cesta" hidden id="ovCesta"><!-- JS: renderPrehled() --></div>

        <div class="panel" data-ovpanel="tipy" hidden>
          <ul class="tip-list">
            <li><svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Sázejte konzistentní částky, 1 až 2 % kapitálu na tiket bohatě stačí.</li>
            <li><svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Držte se sportů a lig, které opravdu znáte, kvantita cíl nesplní.</li>
            <li><svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Trailing drawdown se posouvá s každým novým maximem, hlídejte si rezervu.</li>
            <li><svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Na cíl máte 30 dní, nespěchejte. Průměrně stačí +1 400 Kč denně.</li>
          </ul>
        </div>
      </section>
```

- [ ] **Step 2: Add `renderPrehled()` to `js/dashboard.js`**

At the end of `js/dashboard.js`, append:

```js

// ---------- přehled: render z reálného stavu portfolia ----------
function renderPrehled() {
  const view = document.getElementById("view-prehled");
  if (!view) return;
  const state = Portfolio.ensure("advanced");
  const phaseLabel = state.phase === "funded" ? "Financovaný účet" : `Fáze ${state.phase}`;
  document.getElementById("ovSubtitle").textContent = `${phaseLabel} · Betflow výzva`;
  document.getElementById("ovPhaseChip").textContent = phaseLabel;

  const target = Portfolio.phaseTarget(state);
  const profit = state.balance - state.phaseBaseline;
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((profit / target) * 100))) : 100;
  const toGoal = Math.max(0, target - profit);
  const daysLeft = Portfolio.daysRemaining(state);

  document.getElementById("balanceCard").innerHTML = `
    <div class="balance-top">
      <div>
        <div class="bc-plan">Balíček ${state.packageName}</div>
        <div class="bc-amount">${czk(state.balance)}</div>
        <div class="bc-sub">Aktuální zůstatek</div>
      </div>
      <span class="chip-phase">${state.profitSplit} % podíl</span>
    </div>
    ${state.phase === "funded" ? `
    <div class="bc-goal"><div class="bc-goal-row"><span>Financovaný účet</span><span><b>Neomezeno</b></span></div></div>
    ` : `
    <div class="bc-goal">
      <div class="bc-goal-row"><span>Cíl fáze: <b>${czk(state.phaseBaseline + target)}</b></span><span><b>${pct} %</b></span></div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="bc-meta"><span>${daysLeft} dní zbývá</span><span>Do cíle ${czk(toGoal)}</span></div>
    </div>`}`;

  const s = Portfolio.summary(state);
  document.getElementById("ovStatGrid").innerHTML = `
    <div class="dstat">
      <div class="lbl"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M1.5 11.5l4-4 3 3 5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Zisk</div>
      <div class="val ${s.netProfit >= 0 ? "green" : ""}">${s.netProfit >= 0 ? "+" : ""}${czk(s.netProfit)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="7" r="2" fill="currentColor"/></svg>Do cíle</div>
      <div class="val">${state.phase === "funded" ? "—" : czk(toGoal)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M4.5 2h6v4a3 3 0 01-6 0V2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.5 9v2.5M5 13h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>Výhry</div>
      <div class="val">${s.won} <small>/ ${s.won + s.lost}</small></div>
    </div>
    <div class="dstat">
      <div class="lbl"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2 5a1.5 1.5 0 001.5-1.5h8A1.5 1.5 0 0013 5v1.6a1.9 1.9 0 000 3.8V12a1.5 1.5 0 00-1.5 1.5h-8A1.5 1.5 0 002 12V5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" transform="translate(0,-1.2)"/></svg>Tikety</div>
      <div class="val">${s.total}</div>
    </div>`;

  const dd = Portfolio.drawdownInfo(state);
  document.getElementById("ovLimity").innerHTML = `
    <div class="limit-row">
      <span class="k">Trailing drawdown <small>(HWM: ${czk(dd.hwm)})</small></span>
      <span class="v">${czk(Math.round(dd.remaining))} zbývá</span>
    </div>
    <div class="dd-bar">
      <span class="cap lo">Floor: ${dd.floor.toLocaleString("cs-CZ")}</span>
      <span class="cursor" style="left:${dd.pct}%"></span>
      <span class="cap hi">${state.balance.toLocaleString("cs-CZ")}</span>
    </div>`;

  document.getElementById("ovPravidla").innerHTML = `
    <div class="rules-grid">
      <div class="rule-tile"><div class="k">Profit split</div><div class="v green">${state.profitSplit} %</div></div>
      <div class="rule-tile"><div class="k">Max. sázka</div><div class="v">${czk(state.maxStake)}</div></div>
      <div class="rule-tile"><div class="k">Kurzy</div><div class="v">${ODDS_MIN.toFixed(2)} až ${ODDS_MAX.toFixed(2)}</div></div>
      <div class="rule-tile"><div class="k">Drawdown</div><div class="v">${czk(state.drawdown)}</div></div>
      <div class="rule-tile"><div class="k">Časový limit</div><div class="v">30 dní / fáze</div></div>
      <div class="rule-tile"><div class="k">Min. tiketů</div><div class="v">7</div></div>
    </div>`;

  const steps = [
    { title: "Fáze 1 · Betflow výzva", desc: `Cíl +${czk(state.target1)}`, img: "assets/card2-vyzva.jpg" },
    { title: "Fáze 2 · Verifikace", desc: `Cíl +${czk(state.target2)}`, img: "assets/card2-verifikace.jpg" },
    { title: "Financovaný účet", desc: `${state.profitSplit} % podíl na zisku, neomezený čas, pravidelné výplaty.`, img: "assets/card2-tiper.jpg" },
  ];
  const currentIndex = state.phase === "funded" ? 2 : state.phase - 1;
  document.getElementById("ovCesta").innerHTML = `<div class="journey">${steps.map((step, i) => {
    const cls = i < currentIndex ? "done" : i === currentIndex ? "now" : "";
    const dot = i < 2 ? String(i + 1) : "✓";
    const desc = i === currentIndex && state.phase !== "funded"
      ? `${step.desc}, právě probíhá. Máte ${pct} % splněno.`
      : step.desc;
    return `<div class="j-step ${cls}">
      <div class="j-dot-col"><span class="j-dot">${dot}</span>${i < steps.length - 1 ? '<span class="j-line"></span>' : ""}</div>
      <div class="j-body">
        <img class="j-thumb" src="${step.img}" alt="" />
        <span><span class="t">${step.title}</span><br /><span class="d">${desc}</span></span>
      </div>
    </div>`;
  }).join("")}</div>`;
}
renderPrehled();
```

The trailing `renderPrehled();` call renders the view once immediately on script load (since `view-prehled` is the visible-by-default view and `showView` is only invoked on nav clicks).

- [ ] **Step 3: Verify in browser**

Run: `cd /Users/matejcaban/betflow-upcomers-static && python3 -m http.server 8791`
Open `http://localhost:8791/index.html`, clear state via console (`localStorage.removeItem("bf1:portfolio")`), buy the **200K (Elite)** package, submit registration.
Expected on the resulting `dashboard.html` Přehled view: "Balíček Elite", zůstatek "200 000 Kč", "Cíl fáze: 240 000 Kč", "0 %", "23 dní zbývá" → should read "30 dní zbývá" (fresh start), "Do cíle 40 000 Kč", stat-grid shows "Zisk +0 Kč", "Do cíle 40 000 Kč", "Výhry 0 / 0", "Tikety 0". Click the "Limity"/"Pravidla"/"Cesta" tabs — expect drawdown meter at Floor 184 000 / cursor near 100%, rule tiles matching Elite (Max. sázka 8 000 Kč, Drawdown 16 000 Kč), and the journey highlighting "Fáze 1" as current with "0 %" progress text.
Stop the server: `pkill -f "http.server 8791"`

- [ ] **Step 4: Done (no git repo — skip commit)**

---

### Task 6: Add the equity curve chart and recent-tickets feed to Přehled

**Files:**
- Modify: `dashboard.html` (insert two new panels inside `view-prehled`)
- Modify: `js/dashboard.js` (`renderPrehled()` — fill the two new containers; add two new render helper functions)
- Modify: `css/dashboard.css` (append minimal styles for the SVG chart)

**Interfaces:**
- Consumes: `state.equityHistory`, `state.tickets` (already present on the `Portfolio` state object from Task 2).
- Produces: `renderEquityChart(state) -> htmlString`, `renderRecentTickets(state) -> htmlString` (used only within `js/dashboard.js`, not consumed elsewhere).

- [ ] **Step 1: Insert the equity-chart panel between the balance card and the stat-grid**

In `dashboard.html`, replace:

```html
        <div class="balance-card" id="balanceCard"><!-- JS: renderPrehled() --></div>

        <div class="stat-grid" id="ovStatGrid"><!-- JS: renderPrehled() --></div>

        <button class="btn btn-primary btn-lg cta-bet" data-view-link="sazeni">Sázet teď</button>
```

with:

```html
        <div class="balance-card" id="balanceCard"><!-- JS: renderPrehled() --></div>

        <div class="panel" id="equityPanel">
          <h3>Vývoj zůstatku</h3>
          <div id="equityChart"><!-- JS: renderPrehled() --></div>
        </div>

        <div class="stat-grid" id="ovStatGrid"><!-- JS: renderPrehled() --></div>

        <button class="btn btn-primary btn-lg cta-bet" data-view-link="sazeni">Sázet teď</button>

        <div class="panel" id="recentTicketsPanel">
          <h3>Poslední tikety</h3>
          <div id="recentTickets"><!-- JS: renderPrehled() --></div>
        </div>
```

- [ ] **Step 2: Add the two render helpers and wire them into `renderPrehled()`**

In `js/dashboard.js`, immediately before the `function renderPrehled() {` line (added in Task 5), insert:

```js
function renderEquityChart(state) {
  const points = state.equityHistory;
  if (points.length < 2) {
    return `<p class="bet-msg">Graf se naplní, jakmile proběhne první vsazený a vyhodnocený tiket.</p>`;
  }
  const w = 600, h = 140, pad = 8;
  const values = points.map((p) => p.balance);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = pad + (h - pad * 2) * (1 - (p.balance - min) / span);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const stroke = values[values.length - 1] >= values[0] ? "var(--accent)" : "#ff6b6b";
  return `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="equity-svg" role="img" aria-label="Graf vývoje zůstatku">
      <polyline points="${coords.join(" ")}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
    <div class="equity-range"><span>${czk(min)}</span><span>${czk(max)}</span></div>`;
}

function renderRecentTickets(state) {
  const recent = state.tickets.slice(0, 5);
  if (!recent.length) {
    return `<p class="bet-msg">Zatím žádné tikety. Vsaďte první v sekci Sázení.</p>`;
  }
  return recent.map((t) => {
    const label = t.selections.length > 1
      ? `${t.selections.length}× akumulátor`
      : `${t.selections[0].homeTeam} – ${t.selections[0].awayTeam}`;
    const tag = t.status === "won" ? "win" : t.status === "lost" ? "loss" : t.status === "push" ? "" : "pend";
    const tagText = t.status === "won" ? "Výhra" : t.status === "lost" ? "Prohra" : t.status === "push" ? "Vráceno" : "Čeká";
    return `<div class="k-row neutral">${label} · ${czk(t.stake)}<span class="n"><span class="tag ${tag}">${tagText}</span></span></div>`;
  }).join("");
}
```

Then, still in `renderPrehled()`, immediately after the `document.getElementById("balanceCard").innerHTML = ...` block (the one ending with the closing `` ` `` after `<div class="bc-goal">...`}` ``), add:

```js
  document.getElementById("equityChart").innerHTML = renderEquityChart(state);
```

And after the `document.getElementById("ovStatGrid").innerHTML = ...` block, add:

```js
  document.getElementById("recentTickets").innerHTML = renderRecentTickets(state);
```

- [ ] **Step 3: Add minimal CSS for the chart**

At the end of `css/dashboard.css`, append:

```css
.equity-svg { width: 100%; height: 140px; display: block; }
.equity-range { display: flex; justify-content: space-between; font-size: .6875rem; color: var(--text-muted); margin-top: 4px; }
```

- [ ] **Step 4: Verify in browser**

Run: `cd /Users/matejcaban/betflow-upcomers-static && python3 -m http.server 8791`
Open `http://localhost:8791/dashboard.html` with an existing `bf1:portfolio` state (from Task 5's verification, or re-buy a package). On first load with only the initial equity point, expect the "Graf se naplní…" placeholder message and "Zatím žádné tikety…" in the recent-tickets panel.
Place a bet in Sázení, then in DevTools console manually settle it (reuse the Task 2, Step 5 pattern: seed `state.tickets[0]` to reference the known-settled match `72278396` with a `startTime` in the past, call `await Portfolio.checkSettlements()`), then click back to "Přehled".
Expected: the equity chart now renders a visible polyline (2+ points), and "Poslední tikety" shows the settled ticket with a "Výhra"/"Prohra"/"Vráceno" tag matching its `status`.
Stop the server: `pkill -f "http.server 8791"`

- [ ] **Step 5: Done (no git repo — skip commit)**

---

### Task 7: Wire Výkon (Performance) to real portfolio data

**Files:**
- Modify: `dashboard.html:177-241` (`view-vykon` section — replace hardcoded numbers with JS-fillable containers)
- Modify: `js/dashboard.js` (add `renderVykon()`)

**Interfaces:**
- Consumes: `Portfolio.ensure`, `Portfolio.summary`, `Portfolio.dailyNet` from Task 2; `czk` from `js/dashboard.js:3`.
- Produces: global function `renderVykon()` (already referenced by `showView` and the settlement loop from Task 4).

- [ ] **Step 1: Replace the hardcoded `view-vykon` markup**

In `dashboard.html`, replace lines 177-241:

```html
      <section class="dash-view" id="view-vykon" hidden>
        <div class="dash-head">
          <div>
            <h1>Výkon</h1>
            <p>Statistiky balíčku Elite</p>
          </div>
        </div>

        <div class="stat-grid" style="margin-top:0">
          <div class="dstat"><div class="lbl">Aktuální zisk</div><div class="val green">+6 400 Kč</div></div>
          <div class="dstat"><div class="lbl">Úspěšnost</div><div class="val green">67 %</div></div>
          <div class="dstat"><div class="lbl">Průměrný kurz</div><div class="val">2.14</div></div>
          <div class="dstat"><div class="lbl">Čekající</div><div class="val">1</div></div>
        </div>

        <div class="two-col">
          <div class="panel">
            <h3>Přehled tiketů</h3>
            <div class="k-rows">
              <div class="k-row win">Výherní<span class="n">4</span></div>
              <div class="k-row loss">Prohrané<span class="n">1</span></div>
              <div class="k-row pend">Čekající<span class="n">1</span></div>
            </div>
          </div>
          <div class="panel">
            <h3>Finanční přehled</h3>
            <div class="k-rows">
              <div class="k-row neutral">Vsazeno<span class="n">34 000 Kč</span></div>
              <div class="k-row neutral">Vráceno<span class="n">40 400 Kč</span></div>
              <div class="k-row neutral">Čistý zisk<span class="n green">+6 400 Kč</span></div>
            </div>
          </div>
        </div>

        <div class="two-col">
          <div class="panel">
            <h3>Denní bilance, posledních 7 dní</h3>
            <div class="bar-chart" role="img" aria-label="Sloupcový graf denní bilance">
              <div class="bc-col"><span class="bar pos" style="height:34%"></span><span class="d">Čt</span></div>
              <div class="bc-col"><span class="bar neg" style="height:22%"></span><span class="d">Pá</span></div>
              <div class="bc-col"><span class="bar pos" style="height:58%"></span><span class="d">So</span></div>
              <div class="bc-col"><span class="bar" style="height:6%"></span><span class="d">Ne</span></div>
              <div class="bc-col"><span class="bar pos" style="height:42%"></span><span class="d">Po</span></div>
              <div class="bc-col"><span class="bar pos" style="height:76%"></span><span class="d">Út</span></div>
              <div class="bc-col"><span class="bar" style="height:10%"></span><span class="d">St</span></div>
            </div>
          </div>
          <div class="panel">
            <h3>Poslední tikety</h3>
            <div style="overflow-x:auto">
              <table class="ticket-table">
                <thead><tr><th>Zápas</th><th>Tip</th><th>Kurz</th><th>Vklad</th><th>Stav</th></tr></thead>
                <tbody>
                  <tr><td>Sparta – Slavia</td><td>1</td><td class="odds">2.35</td><td>4 000 Kč</td><td><span class="tag win">Výhra</span></td></tr>
                  <tr><td>Lakers – Celtics</td><td>2</td><td class="odds">1.85</td><td>6 000 Kč</td><td><span class="tag win">Výhra</span></td></tr>
                  <tr><td>Third – Oceláři</td><td>Přes 5.5</td><td class="odds">1.92</td><td>6 000 Kč</td><td><span class="tag loss">Prohra</span></td></tr>
                  <tr><td>Alcaraz – Sinner</td><td>2</td><td class="odds">2.60</td><td>4 000 Kč</td><td><span class="tag win">Výhra</span></td></tr>
                  <tr><td>Plzeň – Baník</td><td>Oba dají gól</td><td class="odds">1.78</td><td>8 000 Kč</td><td><span class="tag win">Výhra</span></td></tr>
                  <tr><td>Arsenal – City</td><td>X</td><td class="odds">3.40</td><td>6 000 Kč</td><td><span class="tag pend">Čeká</span></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
```

with:

```html
      <section class="dash-view" id="view-vykon" hidden>
        <div class="dash-head">
          <div>
            <h1>Výkon</h1>
            <p id="vykonSubtitle">Statistiky balíčku</p>
          </div>
        </div>

        <div class="stat-grid" style="margin-top:0" id="vykonStatGrid"><!-- JS: renderVykon() --></div>

        <div class="two-col">
          <div class="panel">
            <h3>Přehled tiketů</h3>
            <div class="k-rows" id="vykonBreakdown"><!-- JS: renderVykon() --></div>
          </div>
          <div class="panel">
            <h3>Finanční přehled</h3>
            <div class="k-rows" id="vykonFinancials"><!-- JS: renderVykon() --></div>
          </div>
        </div>

        <div class="two-col">
          <div class="panel">
            <h3>Denní bilance, posledních 7 dní</h3>
            <div class="bar-chart" role="img" aria-label="Sloupcový graf denní bilance" id="vykonBarChart"><!-- JS: renderVykon() --></div>
          </div>
          <div class="panel">
            <h3>Poslední tikety</h3>
            <div style="overflow-x:auto">
              <table class="ticket-table">
                <thead><tr><th>Zápas</th><th>Tip</th><th>Kurz</th><th>Vklad</th><th>Stav</th></tr></thead>
                <tbody id="vykonTicketTable"><!-- JS: renderVykon() --></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
```

- [ ] **Step 2: Add `renderVykon()` to `js/dashboard.js`**

At the end of `js/dashboard.js` (after `renderPrehled();`), append:

```js

// ---------- výkon: render z reálného stavu portfolia ----------
function renderVykon() {
  const view = document.getElementById("view-vykon");
  if (!view) return;
  const state = Portfolio.ensure("advanced");
  document.getElementById("vykonSubtitle").textContent = `Statistiky balíčku ${state.packageName}`;
  const s = Portfolio.summary(state);

  document.getElementById("vykonStatGrid").innerHTML = `
    <div class="dstat"><div class="lbl">Aktuální zisk</div><div class="val ${s.netProfit >= 0 ? "green" : ""}">${s.netProfit >= 0 ? "+" : ""}${czk(s.netProfit)}</div></div>
    <div class="dstat"><div class="lbl">Úspěšnost</div><div class="val ${s.winRate >= 50 ? "green" : ""}">${s.winRate} %</div></div>
    <div class="dstat"><div class="lbl">Průměrný kurz</div><div class="val">${s.avgOdds.toFixed(2)}</div></div>
    <div class="dstat"><div class="lbl">Čekající</div><div class="val">${s.pending}</div></div>`;

  document.getElementById("vykonBreakdown").innerHTML = `
    <div class="k-row win">Výherní<span class="n">${s.won}</span></div>
    <div class="k-row loss">Prohrané<span class="n">${s.lost}</span></div>
    <div class="k-row pend">Čekající<span class="n">${s.pending}</span></div>`;

  document.getElementById("vykonFinancials").innerHTML = `
    <div class="k-row neutral">Vsazeno<span class="n">${czk(s.staked)}</span></div>
    <div class="k-row neutral">Vráceno<span class="n">${czk(s.returned)}</span></div>
    <div class="k-row neutral">Čistý zisk<span class="n ${s.netProfit >= 0 ? "green" : ""}">${s.netProfit >= 0 ? "+" : ""}${czk(s.netProfit)}</span></div>`;

  const days = Portfolio.dailyNet(state, 7);
  const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.net)));
  document.getElementById("vykonBarChart").innerHTML = days.map((d) => {
    const heightPct = d.net === 0 ? 4 : Math.max(6, Math.round((Math.abs(d.net) / maxAbs) * 100));
    const cls = d.net > 0 ? "pos" : d.net < 0 ? "neg" : "";
    return `<div class="bc-col"><span class="bar ${cls}" style="height:${heightPct}%"></span><span class="d">${d.label}</span></div>`;
  }).join("");

  const recent = state.tickets.slice(0, 8);
  document.getElementById("vykonTicketTable").innerHTML = recent.length ? recent.map((t) => {
    const label = t.selections.length > 1
      ? `${t.selections.length}× akumulátor`
      : `${t.selections[0].homeTeam} – ${t.selections[0].awayTeam}`;
    const tip = t.selections.length > 1 ? "AKU" : (t.selections[0].pickLabel || "");
    const tag = t.status === "won" ? "win" : t.status === "lost" ? "loss" : t.status === "push" ? "" : "pend";
    const tagText = t.status === "won" ? "Výhra" : t.status === "lost" ? "Prohra" : t.status === "push" ? "Vráceno" : "Čeká";
    return `<tr><td>${label}</td><td>${tip}</td><td class="odds">${t.combinedOdds.toFixed(2)}</td><td>${czk(t.stake)}</td><td><span class="tag ${tag}">${tagText}</span></td></tr>`;
  }).join("") : `<tr><td colspan="5">Zatím žádné tikety.</td></tr>`;
}
```

- [ ] **Step 3: Verify in browser**

Run: `cd /Users/matejcaban/betflow-upcomers-static && python3 -m http.server 8791`
Open `http://localhost:8791/dashboard.html` with the portfolio state from Task 6's verification (one settled ticket). Click "Výkon".
Expected: stat-grid shows real "Aktuální zisk"/"Úspěšnost"/"Průměrný kurz"/"Čekající" derived from that one ticket (e.g. if it won: Zisk positive, Úspěšnost 100%, Čekající 0), "Přehled tiketů" shows 1 in Výherní (or Prohrané), "Finanční přehled" shows matching Vsazeno/Vráceno/Čistý zisk, the daily bar chart shows one non-zero bar on today's weekday, and "Poslední tikety" table shows the one real ticket instead of the old hardcoded 6 rows.
Place a second bet (leave it pending) and switch to Výkon again — expect "Čekající" to increase and the new ticket to appear in the table with a "Čeká" tag.
Stop the server: `pkill -f "http.server 8791"`

- [ ] **Step 4: Done (no git repo — skip commit)**

---

## Self-Review Notes

- **Spec coverage:** §1 (packages.js) → Task 1. §2 (portfolio.js data model) → Task 2. §3 (index.html/main.js wiring) → Task 3. §4 (real "Vsadit") → Task 4. §5 (settlement + market logic) → Task 2 (resolvers) + Task 4 (loop wiring). §6 (Přehled real data + equity chart + recent tickets) → Tasks 5-6. §7 (Výkon real data) → Task 7. Out-of-scope items (drawdown breach, quarter-line splitting, Supabase/React app, Výplaty, per-leg accumulator display) are untouched by all seven tasks, matching the spec.
- **Placeholder scan:** no TBD/TODO; every step has literal, complete code or a literal, runnable verification command.
- **Type consistency:** `Portfolio.get()`/`Portfolio.init()`/`Portfolio.ensure()` return the same state shape throughout (checked against Task 2's definition in every later task's usage); ticket shape (`{id, placedAt, stake, combinedOdds, status, settledAt, payout, selections[]}`) is produced once in `placeBet` (Task 4) and consumed identically in `checkSettlements` (Task 2), `renderPrehled`/`renderRecentTickets` (Tasks 5-6), and `renderVykon` (Task 7) — field names (`homeTeam`, `awayTeam`, `marketName`, `field`, `hdp`, `oddValue`, `pickLabel`) match across all of them.
