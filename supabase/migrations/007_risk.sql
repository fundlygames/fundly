-- 007_risk: pravidelné rizikové skóre účtu (anti-fraud; arbitráž / value betting).
-- Počítá klient (js/dashboard.js buildAccountSnapshot), zapisuje sync-account,
-- čte admin (admin-stats) a whop-payout (potvrzovací flow u rizikových výplat).
ALTER TABLE challenge_accounts
  ADD COLUMN IF NOT EXISTS risk_score int,
  ADD COLUMN IF NOT EXISTS risk_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;
