-- 042_odds_history.sql — historie kurzů ML (vítěz zápasu) pro graf pohybu kurzu a hlídání
-- sledovaných zápasů (js/odds-watch.js).
--
-- Zapisují ji jen edge funkce (service role), BEZ dalších požadavků na odds-api:
--   odds-stream  — živé zápasy: změna ML kurzu z WebSocketu, max. 1 řádek / zápas × bookmaker / 30 s
--   odds-feed    — pre-match: po sestavení balíčku sportu jen řádky, kde se ML kurz změnil
-- ts je zarovnaný na 30s okno → dva souběžné zapisovatelé (překrývající se běhy odds-stream,
-- víc instancí odds-feed) zapíšou stejné okno jen jednou (unikátní index + on conflict do nothing).
-- Retence 7 dní: úklid dělají zapisovatelé (odds-stream jednou za ~10 min, odds-feed max. 1× za hodinu).
create table if not exists public.odds_history (
  event_id text not null,
  bookie text not null,
  ts timestamptz not null,
  home numeric,
  draw numeric,
  away numeric
);

-- (event_id, ts, …): graf v detailu zápasu (event_id = X and bookie = Y and ts >= Z order by ts)
-- a hlídání (event_id in (…) and ts > Z). Unikátní kvůli deduplikaci souběžných zápisů.
create unique index if not exists odds_history_event_ts_idx on public.odds_history (event_id, ts, bookie);
-- úklid starých řádků (delete … where ts < now() - 7 days) — BRIN je u append-only časové řady malý
create index if not exists odds_history_ts_brin on public.odds_history using brin (ts);

alter table public.odds_history enable row level security;
drop policy if exists odds_history_public_read on public.odds_history;
create policy odds_history_public_read on public.odds_history for select to anon, authenticated using (true);
revoke all on public.odds_history from anon, authenticated;
grant select (event_id, bookie, ts, home, draw, away) on public.odds_history to anon, authenticated;

-- Poslední uložený kurz pro každou dvojici zápas × bookmaker. Volá ho jen odds-feed po studeném
-- startu instance (prázdná paměť), aby znovu nezapsal kurzy, které se nezměnily.
create or replace function public.odds_history_latest(p_event_ids text[])
returns table (event_id text, bookie text, ts timestamptz, home numeric, draw numeric, away numeric)
language sql stable
set search_path = public
as $$
  select distinct on (h.event_id, h.bookie) h.event_id, h.bookie, h.ts, h.home, h.draw, h.away
  from public.odds_history h
  where h.event_id = any (p_event_ids[1:2000])
    and h.ts > now() - interval '7 days'
  order by h.event_id, h.bookie, h.ts desc
$$;
revoke all on function public.odds_history_latest(text[]) from public, anon, authenticated;
grant execute on function public.odds_history_latest(text[]) to service_role;
