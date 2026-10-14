-- 027_phase_bonus_days.sql — bonusové dny k 30denní lhůtě aktuální fáze.
-- Důvod: výpadek zdroje kurzů (odds-api, 9.–14. 10. 2026) — hráči nemohli sázet,
-- proto se jim lhůta prodlužuje. Samostatné pole místo posunu phase_started_at,
-- protože phase_started_at řídí i počítání kvalifikačních tiketů a rekonciliaci
-- zůstatku fáze (posun by hráčům "smazal" už odehrané tikety).
-- Nuluje se při startu další fáze (approve-phase). Lhůta se zatím jen zobrazuje
-- (nic ji automaticky nevynucuje), takže pole mění to, co hráč vidí a co admin počítá.
alter table public.challenge_accounts
  add column if not exists phase_bonus_days int not null default 0;
