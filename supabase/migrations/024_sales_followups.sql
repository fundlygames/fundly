-- 024_sales_followups.sql — týdenní follow-up e-maily (viz functions/email-followups).
-- Trasa A: nekoupili (popup s kódem / Preview / registrace bez nákupu).
-- Trasa B: koupili a spálili účet (speciální reset za 40 %).
-- Každý člověk dostane max. 3 e-maily (den 3, 10, 17), nikdy dřív než po 6 dnech
-- od předchozího, a nikdy poté, co se odhlásil.

alter table public.discount_signups add column if not exists lang text;

create table if not exists public.followup_sent (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  track text not null check (track in ('A', 'B')),
  step int not null check (step between 1 and 3),
  sent_at timestamptz not null default now(),
  unique (email, track, step)
);
create index if not exists followup_sent_email_idx on public.followup_sent (email, sent_at desc);

create table if not exists public.email_unsubscribes (
  email text primary key,
  created_at timestamptz not null default now()
);

-- žádné policy → čtení i zápis jen přes service role (edge funkce)
alter table public.followup_sent enable row level security;
alter table public.email_unsubscribes enable row level security;
