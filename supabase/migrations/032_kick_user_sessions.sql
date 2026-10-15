-- 032_kick_user_sessions.sql — ochrana před "pre-hijackem" účtu (viz _shared/mailbox.ts).
-- Kdokoli mohl dřív, než majitel e-mailu cokoli koupil, založit auth účet s jeho adresou
-- a vlastním heslem (checkout signUp, preview-signup i veřejné Supabase API; schránka se
-- nikdy neověřovala). Při nákupu whop-webhook takovému neověřenému účtu změní heslo a
-- zahodí všechny přihlášené relace; do účtu se pak dostane jen přes odkaz z e-mailu.
create or replace function public.kick_user_sessions(p_user uuid)
returns int language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  delete from auth.sessions where user_id = p_user; -- refresh_tokens se smažou kaskádou
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.kick_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.kick_user_sessions(uuid) to service_role;
