-- 004_account_sync: sloupce pro synchronizaci stavu portfolia z klienta
-- (js/dashboard.js → edge funkce sync-account). Pravidla (fáze, breach,
-- kvalifikační tikety, flagy zakázaných strategií) tak jsou vidět v adminu.
-- Původní sloupce zůstávají beze změny.
ALTER TABLE challenge_accounts
  ADD COLUMN IF NOT EXISTS phase_balance numeric,
  ADD COLUMN IF NOT EXISTS profit numeric,
  ADD COLUMN IF NOT EXISTS qualifying_tickets int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS breach_reason text,
  ADD COLUMN IF NOT EXISTS flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tickets_total int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tickets_won int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;
