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
