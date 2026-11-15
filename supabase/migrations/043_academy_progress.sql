-- 043_academy_progress.sql — Fundly Akademie: postup v lekcích (kvízy).
-- Klient (js/academy.js) zapisuje přímo přes supabase-js s JWT přihlášeného hráče:
-- každý vidí a mění jen své řádky (auth.uid() = user_id). Mazání klient nepotřebuje.
-- score = nejlepší výsledek kvízu v % (0–100), passed = aspoň jednou ≥ 80 %,
-- completed_at = kdy byl kvíz poprvé splněn (null, dokud splněný není).
create table if not exists public.academy_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id text not null check (lesson_id ~ '^[a-z0-9-]{1,64}$'),
  score int not null default 0 check (score between 0 and 100),
  passed bool not null default false,
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);

alter table public.academy_progress enable row level security;

drop policy if exists academy_progress_select_own on public.academy_progress;
create policy academy_progress_select_own on public.academy_progress
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists academy_progress_insert_own on public.academy_progress;
create policy academy_progress_insert_own on public.academy_progress
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists academy_progress_update_own on public.academy_progress;
create policy academy_progress_update_own on public.academy_progress
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.academy_progress from anon;
grant select, insert, update on public.academy_progress to authenticated;
