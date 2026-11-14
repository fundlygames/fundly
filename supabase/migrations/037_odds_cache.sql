-- 037_odds_cache.sql — sdílená cache odpovědí odds-api.io pro funkci odds-feed.
-- Dřív si každý hráč stahoval kurzy přímo z odds-api (klíč v prohlížeči), takže
-- hodinová kvóta (5000 požadavků) se dělila mezi VŠECHNY hráče — jeden hráč spotřeboval
-- ~13 požadavků na každý otevřený sport. Při náporu hráčů by kvóta během minut došla
-- a nikdo by neviděl zápasy (a server by nemohl vyhodnocovat tikety).
-- Teď odds-feed stáhne data jednou za TTL a všichni hráči čtou tuhle cache.
create table if not exists public.odds_cache (
  key text primary key,
  body text not null,
  fetched_at timestamptz not null default now()
);

alter table public.odds_cache enable row level security;
-- žádné policy: číst a zapisovat smí jen service role (edge funkce)
