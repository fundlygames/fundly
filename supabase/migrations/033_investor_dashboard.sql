-- 033_investor_dashboard.sql — stránka pro managery a investory (investors.html).
--  * investor_accounts  – kdo má přístup; každý má vlastní tajný odkaz (token) a lze ho kdykoli zrušit
--  * finance_entries    – náklady zadávané v adminu (marketing, nástroje, mzdy…); z nich se počítá čistý zisk
--  * site_visits        – bezcookiová návštěvnost (bez IP; unikátní návštěvník = denní hash)
--  * investor_stats()   – jediná SQL funkce, která z toho všeho vyrobí AGREGOVANÁ čísla (žádné e-maily ani jednotliví hráči)
-- Všechno je zamčené pro anon/authenticated; čte a zapisuje jen service role (edge funkce).

create table if not exists public.investor_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  note text,
  token text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_viewed_at timestamptz,
  views int not null default 0
);
alter table public.investor_accounts enable row level security;
revoke all on public.investor_accounts from anon, authenticated;

create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  kind text not null default 'marketing' check (kind in ('marketing','software','payroll','legal','other')),
  label text,
  amount numeric not null check (amount >= 0),
  currency text not null default 'USD',
  amount_usd numeric not null check (amount_usd >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists finance_entries_date_idx on public.finance_entries (entry_date);
alter table public.finance_entries enable row level security;
revoke all on public.finance_entries from anon, authenticated;

create table if not exists public.site_visits (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  day date not null default ((now() at time zone 'utc')::date),
  path text not null,
  country text,
  source text,
  device text,
  lang text,
  vid text not null
);
create index if not exists site_visits_day_idx on public.site_visits (day);
create index if not exists site_visits_country_idx on public.site_visits (country);
alter table public.site_visits enable row level security;
revoke all on public.site_visits from anon, authenticated;

create or replace function public.investor_stats(p_eur numeric default 1.08, p_czk numeric default 0.044, p_gbp numeric default 1.27, p_pln numeric default 0.25)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  r jsonb;
begin
  with
  pay as (
    select p.id, p.email, p.package_key, p.created_at, p.promo_code, p.status,
      coalesce((p.whop_metadata->>'usd_total')::numeric,
        p.amount * case lower(p.currency) when 'eur' then p_eur when 'czk' then p_czk when 'gbp' then p_gbp when 'pln' then p_pln else 1 end) as gross,
      coalesce((p.whop_metadata->>'amount_after_fees')::numeric, (p.whop_metadata->>'usd_total')::numeric,
        p.amount * case lower(p.currency) when 'eur' then p_eur when 'czk' then p_czk when 'gbp' then p_gbp when 'pln' then p_pln else 1 end) as net,
      coalesce((p.whop_metadata->>'refunded_amount')::numeric, 0) as refunded,
      upper(nullif(p.whop_metadata->'billing_address'->>'country','')) as country
    from payments p
    where coalesce(p.package_key,'') <> 'test'
      and coalesce(p.email,'') !~* '@(example\.com|fundly\.games)$'
  ),
  paid as (select * from pay where status = 'succeeded'),
  usr as (
    select u.id, u.created_at from auth.users u
    where coalesce(u.email,'') !~* '@(example\.com|fundly\.games)$'
  ),
  acc as (
    select a.* from challenge_accounts a
    where coalesce(a.package_key,'') <> 'test'
      and coalesce(a.email,'') !~* '@(example\.com|fundly\.games)$'
  ),
  tix as (
    select t.* from tickets t join acc a on a.id = t.account_id
  ),
  months as (
    select to_char(d,'YYYY-MM') m from generate_series(
      date_trunc('month', least(coalesce((select min(created_at) from paid), now()), coalesce((select min(entry_date) from finance_entries)::timestamptz, now()))),
      date_trunc('month', now()), interval '1 month') d
  ),
  visits as (select * from site_visits),
  vdays as (select day, count(distinct vid) uv, count(*) pv from visits group by day)
  select jsonb_build_object(
    'generated_at', now(),
    'tracking_since', (select min(ts) from visits),
    -- ---------- lidé ----------
    'people', jsonb_build_object(
      'registrations_total', (select count(*) from usr),
      'registrations_7d', (select count(*) from usr where created_at > now() - interval '7 days'),
      'registrations_30d', (select count(*) from usr where created_at > now() - interval '30 days'),
      'registrations_prev_30d', (select count(*) from usr where created_at between now() - interval '60 days' and now() - interval '30 days'),
      'previews', (select count(*) from preview_signups where coalesce(email,'') !~* '@(example\.com|fundly\.games)$'),
      'discount_leads', (select count(*) from discount_signups where coalesce(email,'') !~* '@(example\.com|fundly\.games)$'),
      'waitlist', (select count(*) from waitlist),
      'customers', (select count(distinct lower(email)) from paid),
      'purchases', (select count(*) from paid),
      'repeat_customers', (select count(*) from (select lower(email) from paid group by 1 having count(*) > 1) x),
      'active_players', (select count(*) from acc where state in ('active','pending_approval','funded')),
      'funded_players', (select count(*) from acc where state = 'funded'),
      'pending_approval', (select count(*) from acc where state = 'pending_approval'),
      'closed_accounts', (select count(*) from acc where state = 'breached'),
      'reached_phase2', (select count(*) from acc where phase1_completed_at is not null or phase >= 2),
      'players_by_state', coalesce((select jsonb_object_agg(state, c) from (select state, count(*) c from acc group by 1) s), '{}'::jsonb),
      'players_by_package', coalesce((select jsonb_object_agg(package_key, c) from (select package_key, count(*) c from acc group by 1) s), '{}'::jsonb),
      'active_by_package', coalesce((select jsonb_object_agg(package_key, c) from (select package_key, count(*) c from acc where state in ('active','pending_approval','funded') group by 1) s), '{}'::jsonb),
      'registrations_by_day', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d) from (select (created_at at time zone 'utc')::date d, count(*) n from usr where created_at > now() - interval '120 days' group by 1) s), '[]'::jsonb),
      'registrations_by_month', coalesce((select jsonb_agg(jsonb_build_object('m', m, 'n', n) order by m) from (select to_char(created_at,'YYYY-MM') m, count(*) n from usr group by 1) s), '[]'::jsonb)
    ),
    -- ---------- tržby ----------
    'revenue', jsonb_build_object(
      'gross', coalesce((select sum(gross) from paid), 0),
      'net_of_fees', coalesce((select sum(net) from paid), 0),
      'refunded', coalesce((select sum(refunded) from paid), 0),
      'failed_payments', (select count(*) from pay where status = 'failed'),
      'gross_30d', coalesce((select sum(gross) from paid where created_at > now() - interval '30 days'), 0),
      'gross_prev_30d', coalesce((select sum(gross) from paid where created_at between now() - interval '60 days' and now() - interval '30 days'), 0),
      'discounted_purchases', (select count(*) from paid where promo_code is not null),
      'by_package', coalesce((select jsonb_agg(jsonb_build_object('package', package_key, 'n', n, 'gross', g) order by g desc) from (select package_key, count(*) n, sum(gross) g from paid group by 1) s), '[]'::jsonb),
      'by_country', coalesce((select jsonb_agg(jsonb_build_object('country', country, 'n', n, 'gross', g) order by g desc) from (select coalesce(country,'??') country, count(*) n, sum(gross) g from paid group by 1) s), '[]'::jsonb),
      'by_month', coalesce((select jsonb_agg(jsonb_build_object('m', m.m,
          'gross', coalesce((select sum(gross) from paid where to_char(created_at,'YYYY-MM') = m.m), 0),
          'net', coalesce((select sum(net) from paid where to_char(created_at,'YYYY-MM') = m.m), 0),
          'n', (select count(*) from paid where to_char(created_at,'YYYY-MM') = m.m),
          'costs', coalesce((select sum(amount_usd) from finance_entries where to_char(entry_date,'YYYY-MM') = m.m), 0),
          'marketing', coalesce((select sum(amount_usd) from finance_entries where kind = 'marketing' and to_char(entry_date,'YYYY-MM') = m.m), 0),
          'payouts', coalesce((select sum(amount) from payouts where status = 'paid' and to_char(created_at,'YYYY-MM') = m.m), 0)
        ) order by m.m) from months m), '[]'::jsonb)
    ),
    -- ---------- náklady ----------
    'costs', jsonb_build_object(
      'total', coalesce((select sum(amount_usd) from finance_entries), 0),
      'marketing', coalesce((select sum(amount_usd) from finance_entries where kind = 'marketing'), 0),
      'by_kind', coalesce((select jsonb_object_agg(kind, s) from (select kind, sum(amount_usd) s from finance_entries group by 1) k), '{}'::jsonb),
      'partner_payouts_paid', coalesce((select sum(amount) from payouts where status = 'paid'), 0),
      'partner_payouts_pending', coalesce((select sum(amount) from payouts where status = 'pending'), 0)
    ),
    -- ---------- návštevnost ----------
    'traffic', jsonb_build_object(
      'pageviews_total', (select count(*) from visits),
      'visitors_total', (select coalesce(sum(uv),0) from vdays),
      'visitors_7d', (select coalesce(sum(uv),0) from vdays where day > current_date - 7),
      'visitors_30d', (select coalesce(sum(uv),0) from vdays where day > current_date - 30),
      'visitors_prev_30d', (select coalesce(sum(uv),0) from vdays where day between current_date - 60 and current_date - 30),
      'pageviews_30d', (select coalesce(sum(pv),0) from vdays where day > current_date - 30),
      'by_day', coalesce((select jsonb_agg(jsonb_build_object('d', day, 'uv', uv, 'pv', pv) order by day) from vdays where day > current_date - 90), '[]'::jsonb),
      'by_country', coalesce((select jsonb_agg(jsonb_build_object('country', country, 'n', n) order by n desc) from (select coalesce(country,'??') country, count(distinct (day, vid)) n from visits group by 1 order by 2 desc limit 20) s), '[]'::jsonb),
      'by_source', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'n', n) order by n desc) from (select coalesce(nullif(source,''),'direct') source, count(distinct (day, vid)) n from visits group by 1 order by 2 desc limit 10) s), '[]'::jsonb),
      'by_device', coalesce((select jsonb_agg(jsonb_build_object('device', device, 'n', n) order by n desc) from (select coalesce(device,'?') device, count(distinct (day, vid)) n from visits group by 1) s), '[]'::jsonb),
      'by_language', coalesce((select jsonb_agg(jsonb_build_object('lang', lang, 'n', n) order by n desc) from (select coalesce(lang,'?') lang, count(distinct (day, vid)) n from visits group by 1 order by 2 desc limit 8) s), '[]'::jsonb),
      'funnel', jsonb_build_object(
        'visitors', (select coalesce(sum(uv),0) from vdays),
        'checkout_visitors', (select count(distinct (day, vid)) from visits where path ~* 'checkout'),
        'registrations', (select count(*) from usr where created_at >= coalesce((select min(ts) from visits), now())),
        'purchases', (select count(*) from paid where created_at >= coalesce((select min(ts) from visits), now()))
      )
    ),
    -- ---------- aktivita hráčů ----------
    'activity', jsonb_build_object(
      'tickets_total', (select count(*) from tix),
      'tickets_30d', (select count(*) from tix where placed_at > now() - interval '30 days'),
      'tickets_prev_30d', (select count(*) from tix where placed_at between now() - interval '60 days' and now() - interval '30 days'),
      'volume_total', coalesce((select sum(stake) from tix), 0),
      'win_rate', (select case when count(*) filter (where status in ('won','lost')) = 0 then null else round(100.0 * count(*) filter (where status = 'won') / count(*) filter (where status in ('won','lost')), 1) end from tix),
      'avg_stake', (select round(avg(stake)::numeric, 2) from tix),
      'avg_odds', (select round(avg(combined_odds)::numeric, 2) from tix),
      'active_bettors_30d', (select count(distinct account_id) from tix where placed_at > now() - interval '30 days'),
      'tickets_by_day', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d) from (select (placed_at at time zone 'utc')::date d, count(*) n from tix where placed_at > now() - interval '60 days' group by 1) s), '[]'::jsonb),
      'top_sports', coalesce((select jsonb_agg(jsonb_build_object('sport', sp, 'n', n) order by n desc) from (select coalesce(nullif(selections->0->>'sport',''),'other') sp, count(*) n from tix group by 1 order by 2 desc limit 6) s), '[]'::jsonb)
    )
  ) into r;
  return r;
end $$;
revoke all on function public.investor_stats(numeric, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.investor_stats(numeric, numeric, numeric, numeric) to service_role;
