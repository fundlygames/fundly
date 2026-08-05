// Serverová mapa balíčků — zrcadlí js/packages.js z frontendu.
// Whop API očekává cenu jako desetinné číslo v dané měně (czk).

export interface PackageDef {
  key: string;
  name: string;
  cap: number; // kapitál challenge účtu v Kč
  price: number; // jednorázová cena v Kč
  currency: string;
}

export const PACKAGES: Record<string, PackageDef> = {
  starter: { key: "starter", name: "Starter", cap: 10000, price: 490, currency: "czk" },
  standard: { key: "standard", name: "Standard", cap: 25000, price: 890, currency: "czk" },
  advanced: { key: "advanced", name: "Advanced", cap: 50000, price: 1590, currency: "czk" },
  pro: { key: "pro", name: "Pro", cap: 100000, price: 2990, currency: "czk" },
  elite: { key: "elite", name: "Elite", cap: 200000, price: 4990, currency: "czk" },
};

export function packageByKey(key: string): PackageDef | null {
  return PACKAGES[key] ?? null;
}

// Plan ID z Whop dashboardu (env WHOP_PLAN_STARTER apod.), pokud je nastavené.
export function whopPlanId(key: string): string | null {
  return Deno.env.get(`WHOP_PLAN_${key.toUpperCase()}`) ?? null;
}
