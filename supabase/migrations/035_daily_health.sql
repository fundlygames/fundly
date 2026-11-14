-- 035_daily_health.sql — ranní kontrola celé platformy (edge funkce daily-health + cron 06:30 UTC).
--  * health_reports   – archiv ranních reportů (stav + souhrn), aby šla historie dohledat i bez e-mailu
--  * platform_health() – jedna SQL funkce, která posbírá interní čísla (cron, tikety, účty, platby, support, návštěvnost…)
create table if not exists public.health_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null check (status in ('ok','attention','critical')),
  issues int not null default 0,
  summary jsonb not null default '{}'::jsonb,
  email_sent boolean not null default false
);
alter table public.health_reports enable row level security;
revoke all on public.health_reports from anon, authenticated;

create or replace function public.platform_health()
returns jsonb language plpgsql security definer set search_path = public, auth, cron, net as $$
declare r jsonb;
begin
  with
  internal as (select 1),
  acc as (
    select a.* from challenge_accounts a
    where coalesce(a.package_key,'') <> 'test' and coalesce(a.email,'') !~* '@(example\.com|fundly\.games)$'
  ),
  tix as (select t.* from tickets t join acc a on a.id = t.account_id),
  pay as (
    select * from payments
    where coalesce(package_key,'') <> 'test' and coalesce(email,'') !~* '@(example\.com|fundly\.games)$'
  )
  select jsonb_build_object(
    'generated_at', now(),
    'cron', (select coalesce(jsonb_agg(jsonb_build_object(
        'job', j.jobname, 'active', j.active,
        'last_start', (select max(start_time) from cron.job_run_details d where d.jobid = j.jobid),
        'last_status', (select status from cron.job_run_details d where d.jobid = j.jobid order by start_time desc limit 1),
        'failed_24h', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours' and d.status <> 'succeeded')
      ) order by j.jobname), '[]'::jsonb) from cron.job j),
    'http_5xx_24h', (select count(*) from net._http_response where created > now() - interval '24 hours' and status_code >= 500),
    'tickets', jsonb_build_object(
      'pending', (select count(*) from tix where status = 'pending'),
      'stuck_pending', (select count(*) from tix where status = 'pending' and first_start_time < now() - interval '36 hours'),
      'placed_24h', (select count(*) from tix where placed_at > now() - interval '24 hours'),
      'settled_24h', (select count(*) from tix where settled_at > now() - interval '24 hours'),
      'voided_24h', (select count(*) from tix where admission_note like 'voided:%' and placed_at > now() - interval '24 hours'),
      'void_reasons_24h', coalesce((select jsonb_agg(jsonb_build_object('reason', note, 'n', n) order by n desc) from (select admission_note note, count(*) n from tix where admission_note like 'voided:%' and placed_at > now() - interval '24 hours' group by 1 order by 2 desc limit 5) s), '[]'::jsonb),
      'balance_rejections_24h', (select count(*) from balance_sync_audit where rejected and created_at > now() - interval '24 hours')
    ),
    'accounts', jsonb_build_object(
      'active', (select count(*) from acc where state in ('active','pending_approval','funded')),
      'closed_24h', (select count(*) from acc where state = 'breached' and synced_at > now() - interval '24 hours'),
      'closed_reasons_24h', coalesce((select jsonb_agg(jsonb_build_object('reason', reason, 'n', n) order by n desc) from (select coalesce(breach_reason,'?') reason, count(*) n from acc where state = 'breached' and synced_at > now() - interval '24 hours' group by 1) s), '[]'::jsonb),
      'pending_approval', coalesce((select jsonb_agg(jsonb_build_object('email', email, 'since', pending_requested_at) order by pending_requested_at) from acc where state = 'pending_approval'), '[]'::jsonb),
      'expiring_3d', coalesce((select jsonb_agg(jsonb_build_object('email', email, 'phase', phase, 'deadline', phase_started_at + make_interval(days => 30 + coalesce(phase_bonus_days,0))) order by phase_started_at) from acc where state = 'active' and phase in (1,2) and phase_started_at is not null and phase_started_at + make_interval(days => 30 + coalesce(phase_bonus_days,0)) between now() and now() + interval '3 days'), '[]'::jsonb),
      'overdue_not_closed', (select count(*) from acc where state = 'active' and phase in (1,2) and phase_started_at is not null and phase_started_at + make_interval(days => 30 + coalesce(phase_bonus_days,0) + 2) < now())
    ),
    'payments', jsonb_build_object(
      'last_success_at', (select max(created_at) from pay where status = 'succeeded'),
      'succeeded_24h', (select count(*) from pay where status = 'succeeded' and created_at > now() - interval '24 hours'),
      'amount_24h', coalesce((select sum(amount) from pay where status = 'succeeded' and created_at > now() - interval '24 hours'), 0),
      'failed_24h', (select count(*) from pay where status = 'failed' and created_at > now() - interval '24 hours'),
      'succeeded_7d', (select count(*) from pay where status = 'succeeded' and created_at > now() - interval '7 days'),
      'orphans', coalesce((select jsonb_agg(jsonb_build_object('email', p.email, 'package', p.package_key, 'paid_at', p.created_at, 'payment', p.whop_payment_id) order by p.created_at) from pay p
         where p.status = 'succeeded' and p.created_at > now() - interval '30 days' and coalesce(p.package_key,'') <> 'activation'
           and not exists (select 1 from challenge_accounts a where lower(a.email) = lower(p.email) and a.created_at >= p.created_at - interval '15 minutes')), '[]'::jsonb)
    ),
    'support', jsonb_build_object(
      'open', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'subject', subject, 'email', email, 'message', left(message, 160), 'created_at', created_at, 'age_h', round(extract(epoch from now() - created_at)/3600)) order by created_at) from support_tickets where status = 'open'), '[]'::jsonb),
      'new_24h', (select count(*) from support_tickets where created_at > now() - interval '24 hours'),
      'waitlist_waiting', (select count(*) from waitlist where invited_at is null),
      'payouts_pending', coalesce((select jsonb_agg(jsonb_build_object('amount', amount, 'created_at', created_at)) from payouts where status = 'pending'), '[]'::jsonb)
    ),
    'growth', jsonb_build_object(
      'signups_24h', (select count(*) from auth.users where created_at > now() - interval '24 hours' and coalesce(email,'') !~* '@(example\.com|fundly\.games)$'),
      'visits_24h', (select count(*) from site_visits where ts > now() - interval '24 hours'),
      'visits_prev_24h', (select count(*) from site_visits where ts between now() - interval '48 hours' and now() - interval '24 hours'),
      'followups_sent_24h', (select count(*) from followup_sent where sent_at > now() - interval '24 hours'),
      'snapshots_last', (select max(captured_at) from odds_snapshots)
    ),
    'leftovers', jsonb_build_object(
      'test_users', (select count(*) from auth.users u where u.email ~* '@example\.com$' and u.created_at < now() - interval '24 hours' and not exists (select 1 from payments p where lower(p.email) = lower(u.email)))
    )
  ) into r;
  return r;
end $$;
revoke all on function public.platform_health() from public, anon, authenticated;
grant execute on function public.platform_health() to service_role;
