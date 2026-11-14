-- 038_live_odds.sql — živé kurzy z WebSocketu odds-api (funkce odds-stream).
-- Jeden řádek = zápas × bookmaker. Každá zpráva z WS nese KOMPLETNÍ sadu trhů,
-- takže se řádek vždy celý nahradí ("replace, don't merge" — viz docs odds-api).
--   ml       = jen řádek trhu ML (pro seznam zápasů — pár bajtů na zápas)
--   markets  = všechny odebírané trhy (pro detail zápasu)
-- Prázdné markets = bookmaker trhy stáhl (suspendováno) → klient kurzy schová.
create table if not exists public.live_odds (
  event_id text not null,
  bookie text not null,
  ml jsonb,
  markets jsonb not null default '[]'::jsonb,
  seq bigint,
  updated_at timestamptz not null default now(),
  primary key (event_id, bookie)
);
create index if not exists live_odds_updated_idx on public.live_odds (updated_at);

alter table public.live_odds enable row level security;
drop policy if exists live_odds_public_read on public.live_odds;
create policy live_odds_public_read on public.live_odds for select to anon, authenticated using (true);
grant select on public.live_odds to anon, authenticated;

-- stav WS relé: poslední seq (navázání bez mezer) + statistika posledního běhu
create table if not exists public.odds_stream_state (
  id int primary key default 1 check (id = 1),
  last_seq bigint,
  updated_at timestamptz not null default now(),
  stats jsonb
);
alter table public.odds_stream_state enable row level security;
insert into public.odds_stream_state (id) values (1) on conflict do nothing;
