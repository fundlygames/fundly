-- 014_odds_snapshots.sql — historie kurzů pro FEED_LAG_PATTERN a HIGH_CLV.
-- Ukládá jen kurzy zápasů, na které mají hráči otevřené (pending) tikety —
-- ne celý trh, ať to nezatěžuje odds-api limit zbytečně.
create table if not exists public.odds_snapshots (
  id bigint generated always as identity primary key,
  event_id text not null,
  market_name text not null,
  field text not null,
  hdp numeric, -- pro Totals/Spread linie; ML/BTTS mají null
  odd_value numeric not null,
  captured_at timestamptz not null default now()
);

create index if not exists odds_snapshots_lookup_idx
  on public.odds_snapshots (event_id, market_name, field, captured_at desc);

-- staré snapshoty (>14 dní) nejsou k ničemu — jednoduchý úklid v rámci
-- account-maintenance/cronu by šel doplnit později, zatím jen index.
