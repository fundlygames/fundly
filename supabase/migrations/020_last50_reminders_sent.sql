-- 020_last50_reminders_sent.sql — dedup evidence for the last50-reminder cron
-- job (3 days after signup, no purchase yet → e-mail with LAST50 code).
-- The "who signed up but never paid" list itself is computed on the fly from
-- auth.users vs challenge_accounts/payments (same approach as admin-stats'
-- "Sign-upy bez platby" panel) — this table only remembers who has already
-- gotten the reminder, so the daily cron run never sends it twice.
create table if not exists public.last50_reminders_sent (
  email text primary key,
  sent_at timestamptz not null default now()
);

alter table public.last50_reminders_sent enable row level security;

-- žádná policy pro anon/authenticated → čtení i zápis výhradně přes service role
