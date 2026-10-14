-- public.rls_auto_enable() is the project's "enable RLS on new tables" event trigger function.
-- It returns event_trigger, so it can't do anything when called as an RPC, but the advisors flag
-- any SECURITY DEFINER function that anon/authenticated may execute. Event triggers don't check
-- EXECUTE when they fire, so revoking it changes nothing about how the trigger works.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
