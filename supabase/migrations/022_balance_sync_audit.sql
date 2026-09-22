-- 022_balance_sync_audit.sql — audit log pro sync-account: zaznamenává
-- KAŽDOU změnu phase_balance/profit, včetně toho, jestli byla klientova
-- hodnota odmítnuta (a serverem přepsána na dopočítanou). Bez tohohle
-- neexistoval žádný způsob, jak zpětně zjistit, KDY se účtu zvedl zůstatek
-- bez odpovídajícího tiketu (reálně nalezeno 22.9. — účet měl podklad jen
-- pro $24,608, ale uložený zůstatek byl $27,665, a nešlo dohledat kdy/jak).
create table if not exists public.balance_sync_audit (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.challenge_accounts(id) on delete cascade,
  client_balance numeric not null,
  server_computed_balance numeric not null,
  applied_balance numeric not null,
  rejected boolean not null default false,
  request_ip text,
  created_at timestamptz not null default now()
);

alter table public.balance_sync_audit enable row level security;

-- žádná klientská policy — čte/píše jen service role (edge funkce)
create index if not exists balance_sync_audit_account_idx
  on public.balance_sync_audit (account_id, created_at desc);
