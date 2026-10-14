// _shared/payout-cap.ts — horní strop výplaty odvozený z tiketů (request-payout).
// Dřív server kontroloval jen min./max. částku a stav účtu; "skutečnou kontrolou je ruční
// schválení adminem" — žádost na $4 000 u účtu s $50 zisku tedy prošla do fronty bez
// jakékoli serverové kontroly. Strop je záměrně VOLNÝ (nikdy neodmítne poctivou žádost):
//   dostupné = 80 % × max(0, zisk dokázaný VŠEMI tikety od založení účtu) − už vyplaceno.
// Skutečný nárok (zisk až od fáze 3 nad +5% buffer) je vždy nižší nebo stejný.
export const PAYOUT_SPLIT = 0.8;

export interface CapTicket { stake: number | string | null; payout: number | string | null; status: string }

export function provenProfit(capital: number, tickets: CapTicket[]): number {
  let balance = capital;
  for (const t of tickets) {
    balance -= Number(t.stake) || 0;
    if (t.status === "won" || t.status === "cashedout" || t.status === "push") balance += Number(t.payout) || 0;
  }
  return balance - capital;
}

export function maxPayoutFor(capital: number, tickets: CapTicket[], alreadyPaid: number): number {
  const available = PAYOUT_SPLIT * Math.max(0, provenProfit(capital, tickets)) - (Number(alreadyPaid) || 0);
  return Math.max(0, Math.floor(available * 100) / 100);
}
