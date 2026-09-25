-- 023_payments_meta_capi.sql — výsledek odeslání server-side Purchase do Meta CAPI
-- u každé platby, ať jde ověřit bez čtení logů:
--   select whop_payment_id, package_key, amount, meta_capi_status, meta_event_id
--   from payments order by created_at desc;
alter table public.payments
  add column if not exists meta_capi_status text,
  add column if not exists meta_event_id text;
