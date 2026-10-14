-- 030_lock_down_public_tables.sql — uzamčení tabulek, které šly číst i ZAPISOVAT
-- s veřejným anon klíčem (ten je součástí webu, js/config.js).
--
-- • monthly_reports (měsíční obchodní reporty: tržby, výdaje…) a odds_snapshots
--   (podklad detekce zneužití) neměly zapnuté RLS a anon/authenticated měly plná práva
--   (SELECT i INSERT/UPDATE/DELETE) — kdokoli mohl reporty číst a snapshoty kurzů
--   podvrhnout nebo smazat (a tím zamaskovat FEED_LAG_PATTERN). Klient na ně nikdy
--   nesahal (jen edge funkce se service role, ta RLS obchází).
-- • veřejné INSERT politiky na discount_signups a waitlist zůstaly po starší verzi;
--   edge funkce discount-signup / waitlist-join zapisují service role, takže politiky
--   nic nedělaly, jen umožňovaly zapsat libovolný e-mail přímo přes REST API (mimo
--   validaci a omezení funkce) — a tím nám nutit rozesílat follow-up e-maily cizím lidem.
alter table public.monthly_reports enable row level security;
alter table public.odds_snapshots enable row level security;
revoke all on public.monthly_reports from anon, authenticated;
revoke all on public.odds_snapshots from anon, authenticated;
do $$ begin
  if exists (select 1 from pg_class where relname = 'odds_snapshots_id_seq') then
    execute 'revoke all on sequence public.odds_snapshots_id_seq from anon, authenticated';
  end if;
end $$;
drop policy if exists "anyone can request a discount code" on public.discount_signups;
drop policy if exists "anyone can join waitlist" on public.waitlist;
