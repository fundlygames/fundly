-- 019_preview_signups.sql — účty vytvorené cez homepage "Preview" tlačidlo
-- (pozri sa dovnútra dashboardu bez nákupu balíčka). Evidencia pre admina +
-- sledovanie, či už bol poslaný uvítací e-mail (kód NEWFUNDLY + spätná väzba).
create table if not exists public.preview_signups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  welcome_email_sent_at timestamptz
);

alter table public.preview_signups enable row level security;

-- žádná policy pro anon/authenticated → zápis i čtení výhradně přes service role
-- (edge funkce preview-signup / admin.html), stejný vzor jako tickets tabulka.
create index if not exists preview_signups_email_idx on public.preview_signups (email);
