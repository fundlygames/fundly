# Dashboard visual redesign — prop-firm style

## Problem

`dashboard.html` already has real functional data behind it (balance, equity curve,
drawdown meter, phase journey, recent tickets, Výkon stats, live Sázení odds) but the
visual treatment is generic: flat dark cards, plain inline-SVG icons, and a couple of
stock-photo-style images (`assets/dash-banner.jpg`, `assets/vault-green.jpg`,
`assets/card2-*.jpg`) that don't feel like a cohesive brand. The user wants it to read
as a premium prop-firm product (FundedNext-style: rich equity curves, drawdown meters,
challenge progress) rather than a generic AI-generated dashboard.

## Goal

Redesign the full `dashboard.html` (Přehled, Výkon, Sázení, Žebříček, Výplaty, Profil)
visually — depth, typography hierarchy, custom generated imagery, custom icon set —
without touching or breaking any existing JS data-wiring (`Portfolio`, `renderPrehled`,
`renderVykon`, `renderSlip`, settlement logic, etc.). This is CSS/markup/imagery only.

## Scope

- **Visual language:** keep the existing dark background (`--bg: #020204`) + green
  accent (`--accent: rgb(20 241 149)`) identity — matches `index.html` and is already
  strongly associated with the prop-firm/fintech genre. Add depth via gradient card
  borders, subtle glow behind key numbers (balance, profit), and a clearer typographic
  scale between big numbers and their labels.
- **Custom icon set:** replace the generic inline-SVG outline icons (stat-tile icons,
  rule-tile icons, nav icons) with a single consistent generated icon set in the
  accent-green line-art style.
- **Generated imagery (via `imagegen` CLI):** consistent dark/green abstract "trading
  floor / data" visual family, replacing or supplementing the current stock-photo-style
  assets:
  - New balance-card banner (abstract data/graph pattern instead of the soccer-pitch
    photo)
  - Section header textures/backgrounds for Sázení and Žebříček to visually
    differentiate them
  - Possibly refreshed phase-journey card art (Výzva / Verifikace / Financovaný účet)
    in the same visual family
- **All six dashboard views get the pass** (Přehled, Výkon, Sázení, Žebříček, Výplaty,
  Profil) — not just the stats-heavy ones — per the user's explicit choice.
- `index.html` (landing page) is explicitly out of scope for this pass.

## Constraints

- No changes to `js/dashboard.js`, `js/portfolio.js`, `js/packages.js`, or the data
  flow — this is a pure presentation-layer pass. If a render function's HTML structure
  needs new hooks (e.g. an extra wrapper div for a new visual treatment), that's a
  markup-level change, not a logic change.
- A live betting test is currently in progress (4 real pending bets, watched by a
  background script) — do not disrupt `bf1:portfolio` localStorage state or the
  running watcher.
- Follow the `redesign-existing-projects` skill's audit-first process; use `imagegen-cli`
  for the new imagery.

## Out of scope

- `index.html` / landing page.
- Any change to betting logic, settlement, or data model.
