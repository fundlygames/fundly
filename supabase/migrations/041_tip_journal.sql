-- 041_tip_journal.sql — Deník tipů: volitelná poznámka hráče k tipu ("Proč tento tip?")
-- a důvody (štítky). Zapisuje je jen sync-tickets (service role), vrací restore-account.
-- Oba sloupce jsou nullable — starší tikety poznámku nemají a nic se pro ně nemění.
-- Whitelist štítků musí sedět s NOTE_TAGS v supabase/functions/sync-tickets/index.ts
-- a TAGS v js/journal.js.
alter table public.tickets
  add column if not exists note text,
  add column if not exists note_tags text[];

alter table public.tickets drop constraint if exists tickets_note_len_chk;
alter table public.tickets
  add constraint tickets_note_len_chk check (note is null or char_length(note) <= 280);

alter table public.tickets drop constraint if exists tickets_note_tags_chk;
alter table public.tickets
  add constraint tickets_note_tags_chk check (
    note_tags is null
    or note_tags <@ array['form', 'injuries', 'stats', 'oddsvalue', 'motivation', 'home', 'gut', 'other']::text[]
  );
