-- 012_monthly_reports.sql — historie měsíčních reportů tržeb (automaticky,
-- cron 1. den v měsíci) + podklad pro sekci Reporty v adminu s vlastním
-- datumovým rozsahem (ten dotazuje payments/payouts přímo, nic dalšího nepotřebuje).
create table if not exists public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  month_start date not null unique,
  revenue_usd numeric not null default 0,
  payments_count int not null default 0,
  payouts_usd numeric not null default 0,
  new_accounts int not null default 0,
  created_at timestamptz not null default now()
);
