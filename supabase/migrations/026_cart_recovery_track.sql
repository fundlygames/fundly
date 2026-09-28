-- 026_cart_recovery_track.sql — nová trasa "R" (cart recovery) v follow-up e-mailech.
-- Jeden e-mail (step 1) ~45 min až 48 h po registraci v checkoutu, pokud nezaplatil.
-- Trasy A/B se tím nemění (dál max. 3 kroky); jen se povolí track 'R'.

alter table public.followup_sent drop constraint if exists followup_sent_track_check;
alter table public.followup_sent
  add constraint followup_sent_track_check check (track in ('A', 'B', 'R'));
