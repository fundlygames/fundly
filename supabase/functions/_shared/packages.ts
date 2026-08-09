// Serverová mapa balíčků — zrcadlí js/packages.js z frontendu (USD).
// Plány jsou JEDNORÁZOVÉ (one-time fee); balíček "activation" je jednorázový
// aktivační poplatek $80 pro funded účet (env WHOP_PLAN_ACTIVATION).

export interface PackageDef {
  key: string;
  name: string;
  cap: number; // kapitál challenge účtu v USD
  price: number; // cena v USD (měsíční; u activation jednorázová)
  currency: string;
}

export const PACKAGES: Record<string, PackageDef> = {
  starter: { key: "starter", name: "Starter", cap: 2000, price: 26, currency: "usd" },
  standard: { key: "standard", name: "Standard", cap: 10000, price: 130, currency: "usd" },
  advanced: { key: "advanced", name: "Advanced", cap: 25000, price: 325, currency: "usd" },
  pro: { key: "pro", name: "Pro", cap: 50000, price: 650, currency: "usd" },
  elite: { key: "elite", name: "Elite", cap: 100000, price: 1085, currency: "usd" },
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
