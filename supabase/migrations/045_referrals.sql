-- 045_referrals.sql — program „Pozvi kamaráda" (doporučení hráčů).
--
-- • referral_codes: osobní kód hráče (jeden na auth uživatele). Zakládá ho edge funkce
--   referral-get při prvním otevření záložky Profil → Doporučení, a jen hráči, který má
--   koupený účet. email = e-mail vlastníka (malými písmeny) — whop-checkout podle něj
--   odmítá doporučení sebe sama.
-- • referral_attributions: kdo koho pozval. Řádek (status 'pending') založí whop-checkout,
--   když kupující přijde s platným kódem (?ref=KÓD) a dostane 10 % slevu; whop-webhook ho po
--   úspěšné platbě přepne na 'paid' a vystaví doporučiteli voucher. Jeden řádek na e-mail
--   kupujícího (unikátní) → doporučení se počítá jen jednou na e-mail.
-- • referral_vouchers: sleva 10 % na další balíček doporučitele (vč. resetu). Jeden voucher
--   za každého kamaráda, který opravdu zaplatil (unikátní attribution_id), jednorázový
--   (used_at / used_payment_id zapíše whop-webhook), vouchery se nesčítají — whop-checkout
--   použije na jeden nákup nejvýš jeden. Žádné peníze ani kredit, jen sleva na nákup.
--
-- Veškerý přístup pouze přes service role (edge funkce whop-checkout, whop-webhook,
-- referral-get) — klient na tabulky přímo nesahá, proto žádné policy pro anon/authenticated.

create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{4,16}$'),
  email text not null,                      -- e-mail vlastníka, malými písmeny
  active boolean not null default true,     -- false = admin kód zablokoval (zneužití)
  created_at timestamptz not null default now()
);
create index if not exists referral_codes_email_idx on public.referral_codes (email);

create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  referrer_user_id uuid not null references auth.users (id) on delete cascade,
  buyer_email text not null unique,         -- malými písmeny; 1 doporučení na e-mail
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  package_key text,
  whop_payment_id text,                     -- platba kamaráda (po zaplacení)
  checkout_ip text,                         -- pro ruční kontrolu zneužití (stejná IP jako doporučitel)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists referral_attributions_referrer_idx on public.referral_attributions (referrer_user_id);
create index if not exists referral_attributions_payment_idx on public.referral_attributions (whop_payment_id);

create table if not exists public.referral_vouchers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade, -- doporučitel
  owner_email text not null,                -- e-mail doporučitele, malými písmeny (checkout zná jen e-mail)
  attribution_id uuid unique references public.referral_attributions (id) on delete set null,
  discount_pct numeric not null default 10 check (discount_pct > 0 and discount_pct <= 100),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_payment_id text,
  revoked_at timestamptz                    -- zrušený (refundace platby kamaráda / zneužití)
);
create index if not exists referral_vouchers_owner_idx on public.referral_vouchers (owner_email)
  where used_at is null and revoked_at is null;
create index if not exists referral_vouchers_user_idx on public.referral_vouchers (user_id);

alter table public.referral_codes enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.referral_vouchers enable row level security;
revoke all on public.referral_codes from anon, authenticated;
revoke all on public.referral_attributions from anon, authenticated;
revoke all on public.referral_vouchers from anon, authenticated;
