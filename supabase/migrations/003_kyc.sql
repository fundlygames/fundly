-- 003_kyc: stav ověření identity (Whop KYC) na challenge účtu.
-- Hodnoty: 'unknown' (výchozí), 'verified', 'failed'.
-- Zapisuje whop-webhook (event identity_profile.updated) a čte whop-payout
-- před vytvořením transferu + admin-stats pro detail hráče.
ALTER TABLE challenge_accounts
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'unknown';
