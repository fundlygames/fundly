-- 009_support_tickets.sql — kontaktní formulář (homepage + dashboard) → admin Support.
-- Zápis přes edge funkce (service role); hráč nemá přímý přístup k tabulce.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid references auth.users(id),
  subject text,
  message text not null,
  source text not null default 'contact_form', -- 'contact_form' | 'dashboard'
  status text not null default 'open', -- 'open' | 'answered' | 'closed'
  admin_reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.support_tickets enable row level security;

-- žádná policy pro anon/authenticated → čtení i zápis výhradně přes service role
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_email_idx on public.support_tickets (email);
