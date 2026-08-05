-- 001_whop.sql — tabulky pro Whop integraci: platby, challenge účty, payouty, ads spend.
-- Veškerý zápis a admin čtení probíhá přes service role (edge funkce),
-- hráč vidí přes RLS pouze svůj vlastní challenge účet.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  whop_payment_id text unique,
  email text,
  package_key text,
  amount numeric,
  currency text,
  status text,
  whop_metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  email text,
  package_key text,
  phase int not null default 1,
  capital numeric,
  state text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.challenge_accounts(id),
  amount numeric,
  status text not null default 'pending',
  whop_transfer_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.ad_spend (
  id bigint generated always as identity primary key,
  date date not null,
  channel text not null,
  amount_czk numeric not null,
  source text,
  unique (date, channel)
);

alter table public.payments enable row level security;
alter table public.challenge_accounts enable row level security;
alter table public.payouts enable row level security;
alter table public.ad_spend enable row level security;

-- Hráč smí číst jen svůj vlastní challenge účet. Ostatní tabulky nemají
-- žádnou policy pro anon/authenticated roli → přístup pouze přes service role.
create policy "users read own challenge accounts"
  on public.challenge_accounts
  for select
  using (auth.uid() = user_id);
