-- 031_email_throttle.sql — obrana proti zneužití veřejných funkcí, které posílají e-maily
-- komukoli (discount-signup, request-password-reset, checkout-welcome-email, preview-signup):
-- bez omezení šlo cizí adresu zahltit našimi e-maily a poškodit pověst odesílací domény.
-- email_throttle drží čas posledního odeslání pod klíčem "<druh>:<e-mail>" (jen service role).
create table if not exists public.email_throttle (
  key text primary key,
  last_at timestamptz not null default now()
);
alter table public.email_throttle enable row level security;
revoke all on public.email_throttle from anon, authenticated;

-- "vznikl účet s tímhle e-mailem před chvílí?" — pro checkout-welcome-email, který se
-- smí odeslat jen těsně po skutečné registraci v checkoutu, ne na libovolnou adresu.
create or replace function public.recent_signup_exists(p_email text, p_minutes int)
returns boolean language sql security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users
    where lower(email) = lower(p_email) and created_at > now() - make_interval(mins => p_minutes)
  )
$$;
revoke all on function public.recent_signup_exists(text, int) from public, anon, authenticated;
grant execute on function public.recent_signup_exists(text, int) to service_role;
