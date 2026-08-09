/* Fundly — shared package config (index.html and dashboard.html). */

const PACKAGES = [
  { key: "starter",  name: "Starter",  cap: 2000,   price: 26 },
  { key: "standard", name: "Standard", cap: 10000,  price: 130 },
  { key: "advanced", name: "Advanced", cap: 25000,  price: 325, top: true },
  { key: "pro",      name: "Pro",      cap: 50000,  price: 650 },
  { key: "elite",    name: "Elite",    cap: 100000, price: 1085 },
];

function packageByKey(key) {
  return PACKAGES.find((p) => p.key === key) || PACKAGES[2];
}

// Challenge parameters derived from the chosen package (authoritative doc:
// fundly-pravidla-a-cenotvorba.md). One-time fee; reset fee = 40 % of price.
// phase 1 target = +10 %, phase 2 = +5 %, max. total loss -10 % (STATIC in
// phases 1–2, TRAILING from the highest balance on the funded account),
// max. daily loss = -4 % of capital, max. stake per ticket = 1.5 % of capital,
// profit split 80 %, qualifying tickets = 5 winning tickets with net profit
// ≥ 0.5 % of capital per phase / payout cycle, payout buffer = +5 % (once,
// at the start of the funded phase).
function packageMeta(pkg) {
  return {
    target1: Math.round(pkg.cap * 0.1),
    target2: Math.round(pkg.cap * 0.05),
    drawdown: Math.round(pkg.cap * 0.1),
    dailyLoss: Math.round(pkg.cap * 0.04),
    dailyLossPct: 4,
    maxStake: Math.round(pkg.cap * 0.015),
    profitSplit: 80,
    qualifyingTickets: 5,
    qualifyingTicketProfitPct: 0.5,
    payoutBufferPct: 5,
    resetFee: Math.round(pkg.price * 0.4),
  };
}
