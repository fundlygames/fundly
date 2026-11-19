// Serverová mapa balíčků — zrcadlí js/packages.js z frontendu (USD).
// Plány jsou JEDNORÁZOVÉ (one-time fee); balíček "activation" je jednorázový
// aktivační poplatek $80 pro funded účet (env WHOP_PLAN_ACTIVATION).

export interface PackageDef {
  key: string;
  name: string;
  cap: number; // kapitál challenge účtu v USD
  price: number; // cena v USD (měsíční; u activation jednorázová)
  priceCzk?: number; // cena v Kč pro český web (js/packages.js priceCzk) — chybí = jen USD
  currency: string;
}

export const PACKAGES: Record<string, PackageDef> = {
  starter: { key: "starter", name: "Starter", cap: 2000, price: 70, priceCzk: 1400, currency: "usd" },
  standard: { key: "standard", name: "Standard", cap: 10000, price: 199, priceCzk: 4200, currency: "usd" },
  advanced: { key: "advanced", name: "Advanced", cap: 25000, price: 400, priceCzk: 8500, currency: "usd" },
  pro: { key: "pro", name: "Pro", cap: 50000, price: 700, priceCzk: 14200, currency: "usd" },
  elite: { key: "elite", name: "Elite", cap: 100000, price: 1250, priceCzk: 28400, currency: "usd" },
  // Jednorázový aktivační poplatek funded účtu — není vidět na webu.
  activation: { key: "activation", name: "Activation Fee", cap: 0, price: 80, currency: "usd" },
  // Testovací balíček pro živý end-to-end test (1 EUR) — není vidět na webu.
  test: { key: "test", name: "TEST", cap: 1000, price: 1, currency: "eur" },
};

export function packageByKey(key: string): PackageDef | null {
  return PACKAGES[key] ?? null;
}

// Plan ID z Whop dashboardu (env WHOP_PLAN_STARTER … WHOP_PLAN_ELITE,
// WHOP_PLAN_ACTIVATION, WHOP_PLAN_TEST), pokud je nastavené.
export function whopPlanId(key: string): string | null {
  return Deno.env.get(`WHOP_PLAN_${key.toUpperCase()}`) ?? null;
}

// Reset po spálení účtu = 40 % z (list) ceny balíčku — stejný vzorec jako
// packageMeta().resetFee v js/packages.js (frontend zobrazuje stejné číslo).
export function resetPrice(pkg: PackageDef, currency: string = "usd"): number {
  return Math.round(priceIn(pkg, currency).price * 0.4);
}

// Cena balíčku v požadované měně: "czk" jen tam, kde má balíček priceCzk (český web),
// jinak vždy jeho vlastní měna (USD; activation/test beze změny).
export function priceIn(pkg: PackageDef, currency: unknown): { price: number; currency: string } {
  if (String(currency ?? "").toLowerCase() === "czk" && pkg.priceCzk) return { price: pkg.priceCzk, currency: "czk" };
  return { price: pkg.price, currency: pkg.currency };
}

// Měna cen v e-mailu podle jazyka hráče: cs (vč. sk, viz user-lang.ts) → Kč, jinak USD.
export function currencyForLang(lang: string | null | undefined): string {
  return String(lang ?? "").slice(0, 2).toLowerCase() === "cs" ? "czk" : "usd";
}

// Formát ceny pro e-maily: "1 400 Kč" / "$70".
export function formatPrice(n: number, currency: string): string {
  const v = Math.round(Number(n) || 0);
  if (currency === "czk") return v.toLocaleString("cs-CZ") + "\u00a0Kč";
  return "$" + v.toLocaleString("en-US");
}
