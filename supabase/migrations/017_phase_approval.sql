-- Admin schvalování přechodů mezi fázemi (Phase 1 → Phase 2 → Funded).
-- Hráč, který splní cíl dané fáze, už automaticky nepřeskočí rovnou dál —
-- účet přejde do state = 'pending_approval' a čeká, dokud admin přechod
-- neschválí (nebo nezamítne) v admin sekci. Viz supabase/functions/approve-phase.
alter table challenge_accounts
  add column if not exists pending_phase int,
  add column if not exists pending_requested_at timestamptz,
  add column if not exists admin_note text;
