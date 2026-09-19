-- 021_mfa_trusted_devices.sql — "remember this device" for TOTP 2FA.
-- Customer feedback: has to enter the 6-digit code on every login, even on
-- the same browser/device. Supabase's own MFA has no device-memory concept
-- (every password sign-in starts a fresh session at AAL1, and getting to
-- AAL2 always means a fresh TOTP challenge) — this table lets the client
-- skip the step-up prompt for a device that already proved the code once,
-- for a limited time.
create table if not exists public.mfa_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  unique (user_id, device_id)
);

alter table public.mfa_trusted_devices enable row level security;

-- Uživatel smí číst/zapisovat jen svoje vlastní řádky — funguje i na AAL1
-- session (auth.uid() nezávisí na assurance levelu), což je nutné: kontrola
-- "je tohle zařízení důvěryhodné" musí proběhnout PŘED případnou MFA výzvou.
create policy "users manage their own trusted devices"
  on public.mfa_trusted_devices
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists mfa_trusted_devices_lookup_idx
  on public.mfa_trusted_devices (user_id, device_id, expires_at);
