-- 039_certificates.sql — "Fundly Certified Analyst" certifikát.
-- Vydává se JEDINĚ po splnění obou hodnoticích fází (Fáze 1 + Fáze 2),
-- tj. challenge_accounts.phase2_completed_at je vyplněné (aktivační poplatek
-- ani funded stav se nevyžadují). Jeden certifikát na účet (kind = 'phase2').
--
-- • Zápis výhradně edge funkcí certificate-issue (service role) — ta ověří,
--   že účet patří hráči a Fáze 2 je opravdu splněná, a statistiky spočítá
--   na serveru z tabulky tickets (klient je nedodává).
-- • Hráč smí přes RLS číst své vlastní certifikáty (seznam v dashboardu).
-- • Veřejné ověření (certificate.html?id=…) jde přes security-definer funkci
--   certificate_get(id) — vrací jen jeden nezrušený certifikát podle ID a jen
--   veřejné sloupce (bez user_id/account_id/e-mailu). Záměrně ne veřejný view:
--   ten by šel přes REST API vylistovat celý (jména všech držitelů).

create table if not exists public.certificates (
  id text primary key check (id ~ '^FC-[A-Z0-9]{6}$'),
  account_id uuid not null references public.challenge_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'phase2' check (kind in ('phase2')),
  display_name text not null check (char_length(display_name) between 2 and 40),
  package_key text,
  capital numeric,
  passed_at timestamptz,            -- kdy byla splněná Fáze 2 (phase2_completed_at)
  issued_at timestamptz not null default now(),
  stats jsonb not null default '{}'::jsonb, -- { tips, won, lost, winRate, profitPct, avgOdds, phase1:{…}, phase2:{…} }
  revoked boolean not null default false,
  unique (account_id, kind)
);

create index if not exists certificates_user_idx on public.certificates (user_id);

alter table public.certificates enable row level security;

drop policy if exists "users read own certificates" on public.certificates;
create policy "users read own certificates"
  on public.certificates
  for select
  using (auth.uid() = user_id);

-- anon nic, authenticated jen SELECT (omezený RLS policy výš); zápis jen service role
revoke all on public.certificates from anon;
revoke insert, update, delete, truncate, references, trigger on public.certificates from authenticated;

-- veřejné ověření jednoho certifikátu podle ID
create or replace function public.certificate_get(p_id text)
returns table (
  id text,
  kind text,
  display_name text,
  package_key text,
  capital numeric,
  passed_at timestamptz,
  issued_at timestamptz,
  stats jsonb
)
language sql stable security definer set search_path = public as $$
  select c.id, c.kind, c.display_name, c.package_key, c.capital, c.passed_at, c.issued_at, c.stats
  from public.certificates c
  where c.id = upper(btrim(coalesce(p_id, '')))
    and not c.revoked
  limit 1
$$;

revoke all on function public.certificate_get(text) from public;
grant execute on function public.certificate_get(text) to anon, authenticated, service_role;
