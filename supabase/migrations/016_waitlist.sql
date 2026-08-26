-- 016_waitlist.sql — waitlist pro fázi "jen prvních N kupujících" (LAUNCH_CAPACITY).
-- Kdo se nevejde do limitu, nechá e-mail; admin ho pak z admin.html pozve
-- (invited_at) a při skutečném nákupu se to označí jako vyčerpané (redeemed_at).

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  package_key text,
  created_at timestamptz not null default now(),
  invited_at timestamptz,
  redeemed_at timestamptz
);

alter table public.waitlist enable row level security;

-- Nepřihlášený návštěvník smí jen přidat svůj e-mail (žádné čtení pro anon/authenticated —
-- to jde jen přes service role v edge funkcích, aby nešlo hromadně vytáhnout e-mailovou bázi).
create policy "anyone can join waitlist"
  on public.waitlist
  for insert
  to anon, authenticated
  with check (true);
