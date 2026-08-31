-- ============================================================================
-- Restore EXECUTE on the four RLS helper functions. Fixes a regression from
-- 20260831130100, which broke the dashboard with:
--
--     permission denied for function get_rep_visibility
--
-- WHY IT BROKE
--
-- A policy expression is evaluated as the QUERYING role. So revoking EXECUTE on
-- a function a policy calls does not filter rows - it raises and fails the whole
-- query. The blast radius was far wider than the one error showed:
--
--   current_company_id   62 policies, 58 of them PUBLIC, across 26 tables
--   is_super_admin       19 policies,  6 PUBLIC
--   has_permission        8 policies,  8 PUBLIC  (leads, quotes, sales, appointments)
--   get_rep_visibility    6 policies,  6 PUBLIC  (+ conversations)
--
-- Every core dashboard table - leads, quotes, sales, appointments,
-- conversations, companies, profiles - was unreadable by any signed-in user.
--
-- HOW THE CHECK MISSED IT
--
-- 20260831130100 claimed to have "confirmed that no policy granted to anon or
-- public references either". That query looked for a role NAMED anon or public
-- in pg_policy.polroles. A policy that applies to PUBLIC stores polroles = {0},
-- and oid 0 has no row in pg_roles, so the join dropped all 58 of them and the
-- check reported a clean result. A grant audit has to search policy
-- EXPRESSIONS for the function name, not policy ROLES for a role name.
--
-- THE ACTUAL FIX FOR THE ORIGINAL CONCERN
--
-- The concern behind the revoke was real: get_rep_visibility and has_permission
-- take an arbitrary p_user_id, so any signed-in account could ask about another
-- user's role and permissions. That is a function-body problem, not a grant
-- problem - every one of the 14 policies calls them with auth.uid(), so scoping
-- to the caller inside the function costs the policies nothing and closes the
-- probe. Same pattern already used for route_lead in 20260831130000.
--
-- Both return the safe default rather than raising: they are called from RLS,
-- and an exception inside a policy fails the query instead of filtering it.
-- Fail-closed, never fail-loud.
--
-- auth.uid() is null for the service role, and `null is distinct from null` is
-- false, so a service-role call with p_user_id => null passes the guard and
-- falls through to the same not-found defaults as before.
--
-- current_company_id() and is_super_admin() take no arguments and already
-- describe only the caller, so they just get their grants back.
--
-- VERIFIED AFTER APPLYING
--   as authenticated: leads, quotes, sales, appointments, conversations,
--                     companies and profiles all return 0 rows, no error
--   as anon:          leads and quotes return 0 rows, assets_public returns 108
--   probe as anon:    get_rep_visibility(<random uuid>,'leads') -> 'none'
--                     has_permission(<random uuid>,'can_edit_leads') -> false
--   still shut to both browser roles: activate_rental, release_rental,
--                     add_sms_credits, decrypt_api_key, get_auth_user_id_by_email
-- ============================================================================

grant execute on function public.current_company_id()           to anon, authenticated, service_role;
grant execute on function public.is_super_admin()               to anon, authenticated, service_role;
grant execute on function public.get_rep_visibility(uuid, text) to anon, authenticated, service_role;
grant execute on function public.has_permission(uuid, text)     to anon, authenticated, service_role;

create or replace function public.get_rep_visibility(p_user_id uuid, p_section text)
returns public.rep_visibility
language plpgsql
stable security definer
set search_path = public
as $$
declare v_visibility public.rep_visibility; v_role text;
begin
  -- Callable about yourself only. Returns the closed default for anyone else.
  if p_user_id is distinct from auth.uid() and not public.is_super_admin() then
    return 'none';
  end if;

  select role into v_role from public.profiles where id = p_user_id;
  if v_role in ('owner','admin') then return 'all'; end if;
  execute format('select %I from public.sales_reps where user_id = $1 and is_active = true limit 1', p_section || '_visibility')
    into v_visibility using p_user_id;
  return coalesce(v_visibility, 'none');
end; $$;

create or replace function public.has_permission(p_user_id uuid, p_permission text)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
declare v_role text; v_result boolean;
begin
  -- Callable about yourself only. Returns the closed default for anyone else.
  if p_user_id is distinct from auth.uid() and not public.is_super_admin() then
    return false;
  end if;

  select role into v_role from public.profiles where id = p_user_id;
  if v_role in ('owner','admin') then return true; end if;
  execute format('select %I from public.sales_reps where user_id = $1 and is_active = true limit 1', p_permission)
    into v_result using p_user_id;
  return coalesce(v_result, false);
end; $$;

notify pgrst, 'reload schema';
