-- 046_pick_stats.sql — „Co se sází na Fundly“: souhrn tipů hráčů k zápasům pro detail zápasu
-- (jako „Nejsázenější“ u Tipsportu). Vrací JEN agregáty (počet tipů a součet vkladů na trh a
-- výběr), nikdy účty ani jednotlivé tikety. Zápas se vrátí, až když na něj existují aspoň 3 tipy
-- od aspoň 2 různých účtů, aby souhrn neprozradil sázku jednoho konkrétního hráče.
-- Stornované tikety (admission_note 'voided:…') se nepočítají. U akumulátoru se vklad dělí
-- počtem zápasů na tiketu, aby jeden velký AKO nezkreslil „kolik se vsadilo“.
create or replace function public.event_pick_stats(p_event_ids text[])
returns table (event_id text, market text, field text, tips int, stake numeric)
language sql stable security definer
set search_path = public
as $$
  with sel as (
    select s->>'eventId' as event_id, s->>'marketName' as market, s->>'field' as field,
           t.account_id, coalesce(t.stake, 0) / greatest(jsonb_array_length(t.selections), 1) as stake
    from public.tickets t
    cross join lateral jsonb_array_elements(t.selections) s
    where t.placed_at > now() - interval '21 days'
      and (t.admission_note is null or t.admission_note not like 'voided:%')
      and s->>'eventId' = any (p_event_ids[1:200])
  ), ok as (
    select sel.event_id from sel group by sel.event_id
    having count(*) >= 3 and count(distinct sel.account_id) >= 2
  )
  select sel.event_id, sel.market, sel.field, count(*)::int, round(sum(sel.stake))
  from sel join ok using (event_id)
  where sel.market is not null and sel.field is not null
  group by sel.event_id, sel.market, sel.field
$$;
revoke all on function public.event_pick_stats(text[]) from public;
grant execute on function public.event_pick_stats(text[]) to anon, authenticated, service_role;

create index if not exists tickets_placed_at_idx on public.tickets (placed_at desc);
