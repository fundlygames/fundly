/* Fundly — shared package config (index.html and dashboard.html). */

const PACKAGES = [
  { key: "starter",  name: "Starter",  cap: 2000,   price: 26 },
  { key: "standard", name: "Standard", cap: 10000,  price: 130 },
  { key: "advanced", name: "Advanced", cap: 25000,  price: 325, top: true },
  { key: "pro",      name: "Pro",      cap: 50000,  price: 650 },
  { key: "elite",    name: "Elite",    cap: 100000, price: 1085 },
];

// Neplatný/neznámý package_key (poškozená data, testovací/admin řádek,
// překlep) spadne na PACKAGES[0] — nejmenší a nejlevnější balíček. Dřív
// to padalo na PACKAGES[2] ("advanced", $25k cap) — reálný účet s
// nestandardním package_key "test" tak dostal klientsky Advanced limity
// (max sázka $375 místo správných $30 pro jeho skutečný Starter nákup),
// hráč vsázel v tomhle rozsahu a vznikl nesmyslný, nekonzistentní stav.
// Špatný default má selhat směrem k MÉNĚ výhod, nikdy k víc.
function packageByKey(key) {
  return PACKAGES.find((p) => p.key === key) || PACKAGES[0];
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
