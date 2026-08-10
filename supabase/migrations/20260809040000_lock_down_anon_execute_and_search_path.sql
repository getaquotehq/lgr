-- Two bits of hardening the Supabase security advisor asked for.
--
-- 1. Logged-out visitors could execute 37 SECURITY DEFINER functions, including
--    hard_delete_asset, provision_agency_keys and the api-key encrypt/decrypt
--    pair. They ran with the definer's rights, so the only thing standing in
--    front of them was whatever check each function happened to do itself.
--    Nothing on the public site calls an RPC at all, so anon needs none of them.
--
--    Four are the exception and MUST stay callable by anon: they are invoked
--    inside RLS policies that apply to anon, and a policy expression is
--    evaluated as the querying role. Revoking these would make every one of
--    those policies error out and take the public site down with it -
--    current_company_id alone is referenced by 58 policies.
--
-- 2. Seven functions had a mutable search_path, which lets a caller who can
--    create objects shadow a table name and have the function resolve to
--    theirs instead. Pinned below, including the extra schemas the two that
--    reach outside public actually need.

do $$
declare
  r record;
  keep constant text[] := array[
    'current_company_id',  -- 58 anon-applicable policies
    'has_permission',      -- 8
    'get_rep_visibility',  -- 6
    'is_super_admin'       -- 6
  ];
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef                      -- SECURITY DEFINER only
      and not (p.proname = any(keep))
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    -- Drop the blanket grant, then hand back exactly what still needs it:
    -- signed-in users keep everything they could already run (each of these
    -- gates itself internally), and the service role keeps the ones the edge
    -- functions call. No existing caller loses anything; anon loses the lot.
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant  execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

-- Pin search_path. pg_temp goes last so a temp object can never shadow a real
-- one. The two that reach outside public get exactly the schemas they use.
alter function public.set_updated_at()                  set search_path = public, pg_temp;
alter function public.check_rep_limit()                 set search_path = public, pg_temp;
alter function public.cleanup_expired_reset_tokens()    set search_path = public, pg_temp;
alter function public.sync_is_area_lead_from_source()   set search_path = public, pg_temp;
alter function public.clean_expired_magic_links()       set search_path = public, pg_temp;
alter function public.notify_area_change_request()      set search_path = public, extensions, pg_temp;
alter function public.send_welcome_email()              set search_path = public, auth, extensions, pg_temp;

notify pgrst, 'reload schema';
