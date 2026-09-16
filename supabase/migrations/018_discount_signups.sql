-- 018_discount_signups.sql — e-mailový capture pop-up (40 % zľava, kód NEWFUNDLY).
-- Kód je pevný promo kód uplatniteľný priamo vo Whop checkoute — tabuľka slúži
-- len na evidenciu/remarketing, nie na generovanie individuálnych kódov.
create table if not exists public.discount_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.discount_signups enable row level security;

-- Nepřihlášený návštěvník smí jen přidat svůj e-mail (žádné čtení pro anon/authenticated —
-- to jde jen přes service role v edge funkci, stejný vzor jako waitlist).
create policy "anyone can request a discount code"
  on public.discount_signups
  for insert
  to anon, authenticated
  with check (true);
