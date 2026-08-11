-- 008_payout_rules_risk.sql — payout cooldown/neaktivita + rozšíření
-- risk-scoringu o cross-account signály (sdílené IP / platební metoda)
-- a rychlost postupu fázemi (FAST_TRACK).

-- ---------- payout cooldown (14 dní) ----------
-- last_payout_at se čte přímo z tabulky payouts (status paid/sent) —
-- žádný nový sloupec pro to není potřeba, jen index pro rychlé dotazy.
create index if not exists payouts_account_status_idx
  on public.payouts (account_id, status, created_at desc);

-- ---------- neaktivita účtu (14 dní) ----------
alter table public.challenge_accounts
  add column if not exists last_ticket_at timestamptz,
  add column if not exists inactivity_warned_7 boolean not null default false,
  add column if not exists inactivity_warned_13 boolean not null default false;

-- ---------- fázové časové značky (pro FAST_TRACK) ----------
alter table public.challenge_accounts
  add column if not exists phase1_completed_at timestamptz,
  add column if not exists phase2_completed_at timestamptz,
  add column if not exists funded_at timestamptz;

-- ---------- cross-account signály (SHARED_DEVICE_IP / SHARED_PAYMENT_METHOD) ----------
alter table public.payments
  add column if not exists checkout_ip text,
  add column if not exists payment_fingerprint text;

alter table public.challenge_accounts
  add column if not exists signup_ip text,
  add column if not exists payment_fingerprint text;

-- ---------- watch_status: výsledek posledního risk vyhodnocení ----------
-- 'clear' (<30 bodů), 'watch' (30–99), 'hold' (>=100, payout vyžaduje ruční schválení)
alter table public.challenge_accounts
  add column if not exists watch_status text not null default 'clear';

create index if not exists challenge_accounts_signup_ip_idx on public.challenge_accounts (signup_ip);
create index if not exists challenge_accounts_payment_fingerprint_idx on public.challenge_accounts (payment_fingerprint);
