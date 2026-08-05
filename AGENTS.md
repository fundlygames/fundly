# fundly-upcomers-static — agent guide

> Migrated from Claude Code `.superpowers` session context for Kimi Code.

## Project

Functional betting simulation + prop-firm dashboard. Static site, no git repo.

## Key files

- `index.html` — landing / package picker
- `dashboard.html` — prop-firm dashboard
- `js/packages.js` — shared package config consumed by both `index.html` and `dashboard.html`
- `js/main.js` — landing interactions
- `js/dashboard.js` — dashboard logic
- `admin.html` — admin view
- `docs/superpowers/` — plan + design specs

## Packages

| Key | Name | Cap | Price |
|---|---|---|---|
| starter | Starter | 10 000 | 490 |
| standard | Standard | 25 000 | 890 |
| advanced | Advanced | 50 000 | 1 590 (top) |
| pro | Pro | 100 000 | 2 990 |
| elite | Elite | 200 000 | 4 990 |

Derived challenge params:
- Phase 1 target = 20 % of cap
- Phase 2 target = 10 % of cap
- Trailing drawdown = 8 % of cap
- Max stake per ticket = 4 % of cap
- Profit split = 85 %

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
cd /Users/matejcaban/fundly-upcomers-static
python3 -m http.server 8791
```

Open `http://localhost:8791/index.html` and `http://localhost:8791/dashboard.html`.
