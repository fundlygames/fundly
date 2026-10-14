-- 028_phase_expiry_warned_for.sql — evidence "upozornění před koncem lhůty fáze už odešlo".
-- Ukládá KONKRÉTNÍ termín (deadline), na který upozornění přišlo, ne jen boolean:
-- nová fáze nebo přidané bonusové dny posunou termín → hráč dostane upozornění
-- znovu k novému termínu, bez nutnosti cokoli nulovat (viz _shared/phase-expiry.ts).
alter table public.challenge_accounts
  add column if not exists phase_expiry_warned_for timestamptz;
