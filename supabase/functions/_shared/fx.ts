// _shared/fx.ts — jednoduché přepočty měn na USD (kurzy z env, jinak rozumné výchozí hodnoty).
// Používá admin-stats (platby v jiných měnách), finance-manage (náklady) a investor-stats.
export const CURRENCIES = ["USD", "EUR", "CZK", "GBP", "PLN"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function fxRates() {
  return {
    eur: Number(Deno.env.get("EUR_USD_RATE") ?? 1.08) || 1.08,
    czk: Number(Deno.env.get("CZK_USD_RATE") ?? 0.044) || 0.044,
    gbp: Number(Deno.env.get("GBP_USD_RATE") ?? 1.27) || 1.27,
    pln: Number(Deno.env.get("PLN_USD_RATE") ?? 0.25) || 0.25,
  };
}

export function toUsd(amount: number, currency: string): number {
  const r = fxRates();
  const c = currency.toUpperCase();
  const k = c === "EUR" ? r.eur : c === "CZK" ? r.czk : c === "GBP" ? r.gbp : c === "PLN" ? r.pln : 1;
  return Math.round(amount * k * 100) / 100;
}
