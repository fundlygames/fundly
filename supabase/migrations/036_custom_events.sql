-- 036_custom_events.sql — vlastní (ručně zadané) zápasy, které odds-api.io nenabízí
-- (např. RAF wrestling). Každý řádek drží event ve STEJNÉM tvaru jako odds-api
-- (/events/{id} + /odds/multi), takže dashboard, serverová kontrola tiketu
-- (ticket-admission) i vyhodnocení (settle-tickets, settle-verify) s ním pracují
-- stejně jako s ostatními zápasy. Kurzy jsou pod bookmakerem "Fundly".
--
-- Výsledek: update event jsonb → status 'settled' + scores {home, away}
-- (vítěz 1, poražený 0; remíza 0:0 = vrácení vkladu u dvoucestného ML).
create table if not exists public.custom_events (
  id text primary key check (id like 'fx-%'),
  sport text not null,
  event jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.custom_events enable row level security;

drop policy if exists custom_events_public_read on public.custom_events;
create policy custom_events_public_read on public.custom_events
  for select to anon, authenticated using (active);

grant select on public.custom_events to anon, authenticated;
