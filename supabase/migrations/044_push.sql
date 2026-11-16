-- 044_push.sql — web push upozornění na telefon (js/push.js + sw.js, odesílá _shared/push.ts).
--
-- push_subscriptions: jedno zařízení (prohlížeč / aplikace na ploše) = jeden řádek. Klient
--   zapisuje přímo přes supabase-js s JWT hráče (RLS: jen vlastní řádky); první přihlášení
--   zařízení jde přes push_subscribe() níž, protože stejné zařízení mohl dřív používat jiný
--   účet (endpoint je unikátní a cizí řádek by RLS nedovolila přepsat).
--   prefs = které typy chce hráč na tomhle zařízení dostávat: results (vyhodnocené tipy),
--   matches (sledovaný zápas začíná), limit (blízko denního limitu ztráty).
--   lang = jazyk webu v okamžiku zapnutí (cs/sk → česky, jinak anglicky).
--   Odesílá jen service role (settle-tickets, push-dispatch); 404/410 od push služby = řádek pryč.
-- push_watch: sledované zápasy (jinak jen localStorage "fundly:watchlist") — klient je sem
--   kopíruje, jen když má hráč zapnutá upozornění na zápasy. push-dispatch pošle jeden push
--   ~15 min před začátkem a staré řádky maže.
-- push_log: deduplikace (kind, user_id, ref) — limit: jednou za účet a UTC den
--   (ref = "<account_id>:<YYYY-MM-DD>"), match: jednou za zápas (ref = event_id).
--   Jen service role; push-dispatch maže záznamy starší 30 dní.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1024),
  p256dh text not null check (char_length(p256dh) between 16 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  prefs jsonb not null default '{"results": true, "matches": true, "limit": true}'::jsonb
    check (jsonb_typeof(prefs) = 'object'),
  lang text check (lang is null or lang ~ '^[a-z]{2}$'),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  fail_count int not null default 0
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own on public.push_subscriptions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Přihlášení zařízení k odběru (upsert podle endpointu). SECURITY DEFINER jen kvůli převzetí
-- endpointu, který dřív patřil jinému účtu na stejném zařízení — zapisuje vždy auth.uid(),
-- cizí řádek nikdy nevrací. Bez znalosti endpointu (tajná URL z prohlížeče) nic nepřevezme.
create or replace function public.push_subscribe(
  p_endpoint text, p_p256dh text, p_auth text, p_prefs jsonb default null, p_lang text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sid uuid;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  insert into public.push_subscriptions as s (user_id, endpoint, p256dh, auth, prefs, lang)
  values (uid, p_endpoint, p_p256dh, p_auth,
          coalesce(p_prefs, '{"results": true, "matches": true, "limit": true}'::jsonb), p_lang)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        prefs = case when s.user_id = excluded.user_id and p_prefs is null then s.prefs else excluded.prefs end,
        lang = coalesce(excluded.lang, s.lang),
        fail_count = 0
  returning id into sid;
  return sid;
end;
$$;
revoke all on function public.push_subscribe(text, text, text, jsonb, text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, jsonb, text) to authenticated;

create table if not exists public.push_watch (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id text not null check (event_id ~ '^[A-Za-z0-9_:.-]{1,64}$'),
  start_time timestamptz not null,
  label text not null check (char_length(label) <= 200),
  sport text check (sport is null or char_length(sport) <= 60),
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index if not exists push_watch_due_idx on public.push_watch (start_time) where notified_at is null;

alter table public.push_watch enable row level security;

drop policy if exists push_watch_select_own on public.push_watch;
create policy push_watch_select_own on public.push_watch
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists push_watch_insert_own on public.push_watch;
create policy push_watch_insert_own on public.push_watch
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists push_watch_update_own on public.push_watch;
create policy push_watch_update_own on public.push_watch
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists push_watch_delete_own on public.push_watch;
create policy push_watch_delete_own on public.push_watch
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.push_watch from anon;
grant select, insert, update, delete on public.push_watch to authenticated;

create table if not exists public.push_log (
  kind text not null check (kind in ('result', 'match', 'limit')),
  user_id uuid not null references auth.users (id) on delete cascade,
  ref text not null check (char_length(ref) <= 120),
  created_at timestamptz not null default now(),
  primary key (kind, user_id, ref)
);
create index if not exists push_log_created_idx on public.push_log (created_at);

alter table public.push_log enable row level security;
-- žádná policy pro anon/authenticated → výhradně service role
revoke all on public.push_log from anon, authenticated;
