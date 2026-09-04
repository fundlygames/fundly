# fundly — agent guide

> Migrated from Claude Code `.superpowers` session context for Kimi Code.

## Project

Functional betting simulation + prop-firm dashboard. Static site.
GitHub repo: `fundlygames/fundly` (migrated from the old `matejc-beep/fundly`), deployed via GitHub Pages at the custom domain https://fundly.games/
Local dir: kept under its original working-copy name for compatibility.
Archived React/Supabase (Lovable) version: repo `matejc-beep/betflow-react-archive` — NOT in active use.

## Key files

- `index.html` — landing / package picker
- `dashboard.html` — prop-firm dashboard
- `js/packages.js` — shared package config consumed by both `index.html` and `dashboard.html`
- `js/config.js` — Supabase URL + anon key (placeholders until deploy); `fundlyBackendEnabled()` gates all backend features
- `js/whop.js` — `FundlyCheckout.buy` / `FundlyAuth` (lazy-loads supabase-js from CDN)
- `js/main.js` — landing interactions
- `js/dashboard.js` — dashboard logic
- `admin.html` — admin view (admin-key unlock loads real data via edge functions)
- `supabase/` — backend: migrations + edge functions (whop-checkout, whop-webhook, admin-stats, meta-ads-spend, whop-payout, request-payout, affiliate-manage, affiliate-stats)
- `docs/WHOP-SETUP.md` — Whop/Supabase deployment guide (Czech)
- `docs/superpowers/` — plan + design specs

## Packages

USD, monthly renewal plans (30-day account per month):

| Key | Name | Cap | Price |
|---|---|---|---|
| starter | Starter | $400 | $20/mo |
| standard | Standard | $1,000 | $35/mo |
| advanced | Advanced | $2,000 | $65/mo (top) |
| pro | Pro | $4,000 | $125/mo |
| elite | Elite | $8,000 | $200/mo |

Plus `activation` ($80 one-time fee for funded accounts, env `WHOP_PLAN_ACTIVATION`).

Derived challenge params (see `packageMeta()` in js/packages.js):
- Phase 1 target = +10 % of cap, Phase 2 = +5 %, 30 days per phase
- Max. total loss = −10 % of cap, STATIC (fixed floor, no trailing)
- Max stake per ticket = 1.5 % of cap
- Profit split = 80 %
- Qualifying tickets = 5 winning tickets with net profit ≥ 0.5 % of cap per phase / payout
- Payout conditions: +5 % profit buffer, 5 qualifying tickets, max $4,000 per payout
- Bookmaker feed: Betano (odds-api.io); forbidden strategies (arbitrage / value) flag tickets
- Admin access: Supabase Auth + `admin_users` table (migration 006), functions accept admin JWT or x-admin-key

## Completed work (as of final review)

Branch `feature/functional-betting-dashboard` — all 7 tasks + final review fixes complete.

- Shared package config
- Portfolio state / capital progress / phase logic
- Bet placement, ticket settlement, recent tickets
- Prop-firm dashboard redesign
- Auth redirect flow
- UI polish and review fixes

## Known issues / deferred items

- Zisk / Do cíle can look contradictory right after a phase advance.
- Pending stakes count as a loss in `netProfit` until settled.
- Equity history / event-status cache grows unbounded.
- "Nejprve se přihlaste" message is misleading if `localStorage` is disabled.
- "Min. tiketů: 7" copy is unenforced.

## How to verify locally

```bash
cd <project-root>
python3 -m http.server 8791
```

Open `http://localhost:8791/index.html` and `http://localhost:8791/dashboard.html`.
