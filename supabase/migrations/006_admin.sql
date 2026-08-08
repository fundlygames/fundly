-- 006_admin: skutečné admin účty + sázkový profil na challenge účtu.

-- Tabulka adminů — seeding ručně (vložit user id vlastníka):
--   INSERT INTO admin_users (user_id) VALUES ('<uuid z auth.users>');
CREATE TABLE IF NOT EXISTS admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- uživatel čte jen svůj řádek (klient tak pozná, zda je admin)
DROP POLICY IF EXISTS "admin_users_select_own" ON admin_users;
CREATE POLICY "admin_users_select_own" ON admin_users
  FOR SELECT USING (auth.uid() = user_id);

-- #9: kompaktní sázkový profil hráče (top sporty/ligy, průměry),
-- zapisuje edge funkce sync-account z dashboardu.
ALTER TABLE challenge_accounts
  ADD COLUMN IF NOT EXISTS betting_profile jsonb;
