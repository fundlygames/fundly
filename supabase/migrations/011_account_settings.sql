-- 011_account_settings.sql — preferovaná výplatní metoda (nastavení účtu),
-- předvyplní formulář žádosti o výběr.
alter table public.challenge_accounts
  add column if not exists payout_method text;
