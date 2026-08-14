-- 015_account_restore.sql — plný snapshot portfolia pro obnovu stavu, když
-- klientovi zmizí localStorage (Safari ITP po ~7 dnech neaktivity, soukromé
-- okno, jiné zařízení/prohlížeč, vymazaná data). Dřív se v tom případě
-- reálný placený účet tiše resetoval na čerstvý kapitál (Portfolio.init()),
-- protože server znal jen balance/phase/profit, ne dost na věrnou rekonstrukci
-- (hwm pro trailing drawdown, day start pro denní limit, phase start pro
-- 30denní lhůtu a kvalifikační okno, last payout pro cooldown).
alter table public.challenge_accounts
  add column if not exists hwm numeric,
  add column if not exists phase_baseline numeric,
  add column if not exists phase_started_at timestamptz,
  add column if not exists day_start_date date,
  add column if not exists day_start_balance numeric,
  add column if not exists last_payout_at timestamptz;
