-- 010_leaderboard.sql — reálný leaderboard: přezdívka + opt-in ke sdílení.
-- Bez přezdívky se hráč v žebříčku zobrazí anonymně jako "Player #<4 znaky id>".

alter table public.challenge_accounts
  add column if not exists nickname text,
  add column if not exists leaderboard_opt_in boolean not null default true;
