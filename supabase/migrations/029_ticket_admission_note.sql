-- 029_ticket_admission_note.sql — poznámka serverové kontroly nového tiketu (viz
-- _shared/ticket-admission.ts). "voided: <důvod>" = tiket byl stornován (status push,
-- vklad vrácen); "would void: <důvod>" = režim jen-logování (TICKET_ADMISSION_ENFORCE=false).
alter table public.tickets
  add column if not exists admission_note text;
