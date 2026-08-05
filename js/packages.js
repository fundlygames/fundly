/* Fundly — sdílená konfigurace balíčků (index.html i dashboard.html). */

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

// Odvozené parametry výzvy ze zvoleného balíčku — nová pravidla:
// cíl fáze 1 = +10 %, fáze 2 = +5 %, max. celková ztráta -10 % STATICKÁ
// (pevný floor = kapitál − drawdown, žádný trailing přes HWM), max. vklad
// na tiket = 4 % kapitálu, profit split 80 %, kvalifikační tikety =
// 5 výherných tiketů s čistým ziskem ≥ 0,5 % kapitálu na fázi / payout,
// payout buffer = +5 % kapitálu.
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
