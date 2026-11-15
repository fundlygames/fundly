-- 040_weekly_report.sql — týdenní e-mail s analýzou tipů (edge funkce weekly-report).
-- weekly_report_opt_out: hráč se odhlásil z týdenního přehledu (odkaz v e-mailu →
--   unsubscribe.html?type=weekly → email-unsubscribe nastaví true na všech účtech s tím e-mailem).
--   Propagační odhlášení (email_unsubscribes) se ho netýká — jde o servisní e-mail.
-- weekly_report_log: jeden řádek = report pro účet za daný týden (week_start = pondělí, UTC).
--   Primární klíč dělá job idempotentní: řádek se zapíše PŘED odesláním (claim), při
--   selhání odeslání se smaže, takže opakovaný běh ve stejném týdnu nic nepošle dvakrát.
alter table public.challenge_accounts
  add column if not exists weekly_report_opt_out boolean not null default false;

create table if not exists public.weekly_report_log (
  account_id uuid not null references public.challenge_accounts(id) on delete cascade,
  week_start date not null,
  sent_at timestamptz not null default now(),
  email text,
  primary key (account_id, week_start)
);

alter table public.weekly_report_log enable row level security;
revoke all on public.weekly_report_log from anon, authenticated;
-- žádná policy → čtení i zápis jen přes service role (edge funkce)
