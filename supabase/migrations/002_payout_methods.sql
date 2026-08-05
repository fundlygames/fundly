-- 002_payout_methods.sql — způsob výplaty u payoutů + RLS: hráč čte vlastní výběry.
-- Zápis do payouts zůstává výhradně na edge funkcích (service role).

alter table public.payouts add column if not exists method text;

-- Hráč smí číst jen payouty svých vlastních challenge účtů.
create policy "payouts_select_own"
  on public.payouts
  for select
  using (exists (
    select 1 from public.challenge_accounts ca
    where ca.id = payouts.account_id and ca.user_id = auth.uid()
  ));
