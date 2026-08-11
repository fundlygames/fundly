-- 013_tickets.sql — jednotlivé tikety na serveru (dosud šly jen souhrny).
-- Umožňuje cross-account detekci (MULTI_ACCOUNT_COLLUSION, BOT_PATTERN,
-- TIMING_ANOMALY, LOW_VARIANCE). Zapisuje edge funkce sync-tickets,
-- unikátní (account_id, client_ticket_id) dovoluje bezpečný re-sync.
-- selections jako jsonb (ne rozplacené sloupce) — tiket může být akumulátor
-- s víc zápasy, kolizní/timing detekce v risk.ts nad tím prochází v JS.
-- Tvar prvku: { eventId, sport, league, marketName, field, startTime, oddValue }
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.challenge_accounts(id) on delete cascade,
  client_ticket_id text not null,
  selections jsonb not null default '[]'::jsonb,
  first_start_time timestamptz, -- nejbližší začátek ze selections (pro TIMING_ANOMALY)
  stake numeric,
  combined_odds numeric,
  status text not null, -- pending | won | lost | push | cashedout
  placed_at timestamptz not null,
  settled_at timestamptz,
  payout numeric,
  created_at timestamptz not null default now(),
  unique (account_id, client_ticket_id)
);

alter table public.tickets enable row level security;
-- žádná policy pro anon/authenticated → čtení i zápis výhradně přes service role

create index if not exists tickets_account_idx on public.tickets (account_id, placed_at desc);
create index if not exists tickets_selections_gin_idx on public.tickets using gin (selections);
