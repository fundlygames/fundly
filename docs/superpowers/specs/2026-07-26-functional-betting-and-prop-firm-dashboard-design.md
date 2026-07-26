# Functional betting simulation + prop-firm-style dashboard

## Problem

The static demo (`betflow-upcomers-static`) has real match/odds data (odds-api.io) and a working
bet-slip UI, but placing a bet ("Vsadit") is a no-op stub — no balance change, no ticket recorded.
The `Přehled` (Overview) view has hardcoded demo numbers and, aside from a chart, is largely already
structured like a prop-firm dashboard (drawdown meter, rules, phase journey) but none of it reflects
anything the user actually does. There is no way to test the betting loop end-to-end.

A separate, real backend already exists for the React app (`betflow-upcomers`, Supabase-backed: 59
migrations, tables for matches/odds/bets/challenges/withdrawals, edge functions including
`odds-sync` and `settle-bets`). That is the eventual production backend. This spec is scoped only to
making the **static demo** self-contained and testable client-side — it does not touch Supabase or
the React app.

## Goal

1. Make the full loop testable client-side: buy a package → dashboard starts with that package's
   capital → place real bets on real upcoming matches → bets settle against real match results →
   balance, drawdown, phase progress, and stats all update accordingly.
2. Make `Přehled` feel like a prop-firm dashboard with live data: equity curve, recent tickets,
   real drawdown/rules/phase state — not just richer-looking static markup.

## Scope

### 1. Shared package config — `js/packages.js`

Move the `PACKAGES` array (currently defined only in `main.js`) into a new shared file loaded by
both `index.html` and `dashboard.html`. Same 5 packages/prices/capitals as today. Derived per
package: phase 1 target = cap × 0.20, phase 2 target = cap × 0.10, trailing drawdown = cap × 0.08,
max stake per ticket = cap × 0.04, profit split = 80% (85% with bonus tier, unchanged from today's
copy) — same formulas `main.js` already uses for the pricing cards.

### 2. Shared portfolio state — `js/portfolio.js`

A single localStorage-backed object (key `bf1:portfolio`), with a small module API
(`Portfolio.init(packageKey)`, `Portfolio.get()`, `Portfolio.placeBet(...)`, `Portfolio.checkSettlements()`):

```
{
  packageKey, cap, price,          // from the chosen package
  phase: 1 | 2 | 'funded',
  phaseStartedAt,                  // for "X dní zbývá" (30-day limit per phase)
  balance,                         // current cash balance
  hwm,                             // trailing high-water-mark for drawdown floor
  tickets: [{
    id, matchId, sport, league, homeTeam, awayTeam, startTime,
    marketName, pickLabel, pickField, hdp, oddValue,
    stake, placedAt, status: 'pending' | 'won' | 'lost' | 'push',
    settledAt, payout
  }],
  equityHistory: [{ t, balance }], // one point per placed/settled event, feeds the chart
}
```

- **Init**: happens in `index.html`'s auth submit handler (see §3), not in `dashboard.js` — by the
  time `dashboard.html` loads, the state already exists.
- **Phase advancement**: when `balance - cap >= target(phase)`, advance `phase` (1→2→'funded'),
  keep `balance`/`hwm`/`tickets`/`equityHistory` continuous across the transition. No re-entry to a
  previous phase modeled.
- **Explicitly out of scope**: breaching the drawdown floor does not fail/lock the challenge — the
  meter just shows the distance. Modeling challenge failure is a natural follow-up, not part of this
  change.

### 3. Wiring the package into the dashboard — `index.html` / `js/main.js`

Per the earlier decision to keep auth submit → redirect to `dashboard.html`, extend that handler:
- On **register** (the "Koupit výzvu" flow): call `Portfolio.init(activeKey)`, which resets/creates
  the portfolio state from the currently selected package before redirecting.
- On **login**: if a portfolio already exists in localStorage, leave it untouched (don't reset
  progress just by logging back in). If none exists yet (e.g. user goes straight to "Přihlášení"
  without ever buying), initialize with a default package (`advanced`) so the dashboard isn't broken.

### 4. Making "Vsadit" real — `dashboard.js`

Replace the current stub (the `placeBet` click handler that only shows a static note) with
`Portfolio.placeBet(...)`:
- Validates: bet slip non-empty, stake > 0, stake ≤ current `maxStake` (cap × 0.04), stake ≤
  available balance.
- On success: deducts stake from balance, appends a `pending` ticket per slip selection (accumulator:
  one ticket holds all selections, combined odds — matching today's slip UI, not one ticket per leg),
  clears the slip, appends an equity-history point, shows a success note, and re-renders whatever
  view is active so the change is visible immediately.
- On validation failure: shows the specific reason (same inline note element used today).

### 5. Settlement — `dashboard.js` + `js/portfolio.js`

`Portfolio.checkSettlements()` runs once on any dashboard page load, and via `setInterval` every 60s
while the tab stays open:
- Collects unique `matchId`s from `pending` tickets whose `startTime` has already passed.
- For each, checks a localStorage cache (`bf1:eventStatus:<id>`, 2 min TTL — same caching pattern
  already used for match lists) before calling `GET /events/{id}` (confirmed today: returns
  `status: "settled"` and final score in `scores.periods.ft` once a match concludes).
- When `settled`, resolves each ticket via market-specific logic:
  - **Match winner (ML)**: compare final home/away score → home/draw/away.
  - **Totals (over/under)**: compare `home+away` total to the line (`hdp`).
  - **Both Teams To Score**: both final scores > 0 → yes, else no.
  - **Spread (Asian handicap)**: apply `hdp` to the picked side's score, compare adjusted scores.
    Works correctly for whole/half lines; quarter lines (.25/.75 split stakes) are approximated as a
    single win/loss rather than a split settlement — noted as a known simplification, not a bug to
    chase in this pass.
  - **Anything else** (corners, correct score, HT-specific markets, etc.): settle as `push` — refund
    the stake rather than guess an outcome we can't confidently derive from the data we have.
- On win: `balance += stake × oddValue`; on push: `balance += stake`; on loss: no change. Updates
  `hwm` if balance reached a new high, appends an equity-history point, persists, re-renders.

### 6. Přehled (Overview) — real data + two new pieces

Everything currently hardcoded in `view-prehled` becomes JS-rendered from `Portfolio.get()`:
balance card, stat-grid (Zisk/Do cíle/Výhry/Tikety), the **Limity** tab's drawdown meter, the
**Pravidla** tab's rule tiles, and the **Cesta** tab's phase journey (now actually highlights the
current phase and advances when it's cleared).

Two new pieces:
- **Equity curve**: a small hand-rolled inline SVG polyline (no chart library — matches the existing
  hand-rolled bar chart style in Výkon) plotting `equityHistory`, placed between the balance card and
  the stat-grid.
- **Recent tickets feed**: compact list of the last 3–5 tickets (any status) with team names, market,
  stake, and a status badge — placed below the stat-grid, above the existing subtabs.

### 7. Výkon (Performance) — real data

The stat-grid, ticket breakdown (výherní/prohrané/čekající), financial summary
(vsazeno/vráceno/čistý zisk), the "posledních 7 dní" bar chart, and the full "Poslední tikety" table
all recompute from `Portfolio.get().tickets` instead of the hardcoded rows that exist today.

## Out of scope (explicitly deferred)

- Challenge failure / drawdown-breach handling (locking the account, "you failed" state).
- Splitting quarter-line Asian handicap tickets into half win / half loss.
- Any change to `betflow-upcomers` (the React/Supabase app) — this is static-demo only.
- Výplaty (Withdrawals) view — not wired to portfolio state in this pass.
- Per-leg settlement display for accumulators beyond the combined ticket (matches today's slip UX).
