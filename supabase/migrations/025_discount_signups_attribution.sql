-- 025_discount_signups_attribution.sql — zdroj příchodu (UTM z reklamy) u popup signupů
alter table public.discount_signups add column if not exists attribution jsonb;
