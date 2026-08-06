/* Fundly — shared package config (index.html and dashboard.html). */

const PACKAGES = [
  { key: "starter",  name: "Starter",  cap: 400,  price: 20 },
  { key: "standard", name: "Standard", cap: 1000, price: 35 },
  { key: "advanced", name: "Advanced", cap: 2000, price: 65, top: true },
  { key: "pro",      name: "Pro",      cap: 4000, price: 125 },
  { key: "elite",    name: "Elite",    cap: 8000, price: 200 },
];

function packageByKey(key) {
  return PACKAGES.find((p) => p.key === key) || PACKAGES[2];
}

// Challenge parameters derived from the chosen package:
// phase 1 target = +10 %, phase 2 = +5 %, max. total loss -10 % STATIC
// (fixed floor = capital − drawdown, no trailing across HWM), max. stake
// per ticket = 4 % of capital, profit split 80 %, qualifying tickets =
// 5 winning tickets with net profit ≥ 0.5 % of capital per phase / payout,
// payout buffer = +5 % of capital.
function packageMeta(pkg) {
  return {
    target1: Math.round(pkg.cap * 0.1),
    target2: Math.round(pkg.cap * 0.05),
    drawdown: Math.round(pkg.cap * 0.1),
    maxStake: Math.round(pkg.cap * 0.04),
    profitSplit: 80,
    qualifyingTickets: 5,
    qualifyingTicketProfitPct: 0.5,
    payoutBufferPct: 5,
  };
}
