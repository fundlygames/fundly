// Serverová mapa balíčků — zrcadlí js/packages.js z frontendu (USD).
// Plány jsou MĚSÍČNÍ (30denní renewal) — env WHOP_PLAN_<KEY> ukazuje na
// měsíční plán; balíček "activation" je jednorázový aktivační poplatek $80
// pro funded účet (env WHOP_PLAN_ACTIVATION).

export interface PackageDef {
  key: string;
  name: string;
  cap: number; // kapitál challenge účtu v USD
  price: number; // cena v USD (měsíční; u activation jednorázová)
  currency: string;
}

export const PACKAGES: Record<string, PackageDef> = {
  starter: { key: "starter", name: "Starter", cap: 400, price: 20, currency: "usd" },
  standard: { key: "standard", name: "Standard", cap: 1000, price: 35, currency: "usd" },
  advanced: { key: "advanced", name: "Advanced", cap: 2000, price: 65, currency: "usd" },
  pro: { key: "pro", name: "Pro", cap: 4000, price: 125, currency: "usd" },
  elite: { key: "elite", name: "Elite", cap: 8000, price: 200, currency: "usd" },
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
