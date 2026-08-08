-- 005_affiliate.sql — affiliate systém: promo kódy se zakládají ve Whop
-- (edge funkce affiliate-manage), u nás držíme vlastníka, provizi a doplněk
-- pro reporting. Webhook zapisuje promo kód z platebního payloadu do payments.
-- Veškerý přístup pouze přes service role (edge funkce) — affiliate-stats
-- čte kódy vlastníkovi až po ověření jeho JWT.

alter table public.payments
  add column if not exists promo_code text,
  add column if not exists affiliate text;

create table if not exists public.affiliate_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  owner_email text not null,
  plan_key text not null default 'all', -- klíč balíčku nebo 'all' = všechny
  discount_pct numeric not null,        -- sleva pro zákazníka v %
  commission_pct numeric not null,      -- provize affiliate v %
  usage_limit int,                      -- globální limit použití (null = bez limitu)
  whop_promo_id text,                   -- promo_... id z Whop API
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.affiliate_codes enable row level security;

-- Žádná policy pro anon/authenticated roli → čtení i zápis výhradně přes
-- service role (affiliate-manage pro admina, affiliate-stats pro vlastníka).
