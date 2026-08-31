-- ============================================================================
-- Follow-up to 20260831130000: four functions were still reachable by anon.
--
-- The revokes in that migration named `anon` and `authenticated`. Postgres also
-- grants EXECUTE on every new function to PUBLIC, and anon is a member of
-- PUBLIC, so revoking the named grant left the inherited one in place and anon
-- kept access. Verified after applying: current_company_id, is_super_admin,
-- has_permission and get_rep_visibility were all still executable by anon.
--
-- Order matters here. Granting the roles that genuinely need each function
-- BEFORE dropping the PUBLIC grant means nothing is left depending on PUBLIC -
-- if `authenticated` had only ever reached current_company_id() through PUBLIC,
-- revoking it first would have broken every RLS policy that calls it.
-- ============================================================================

-- Self-scoped: both read auth.uid() and describe only the caller. Needed by
-- `authenticated` because RLS policies call them and policies evaluate as the
-- calling role.
grant execute on function public.current_company_id() to authenticated, service_role;
grant execute on function public.is_super_admin()     to authenticated, service_role;
revoke execute on function public.current_company_id() from public, anon;
revoke execute on function public.is_super_admin()     from public, anon;

-- Take an arbitrary user id rather than deriving it from the session, and
-- nothing in any client calls them. Server-side only.
grant execute on function public.get_rep_visibility(uuid, text) to service_role;
grant execute on function public.has_permission(uuid, text)     to service_role;
revoke execute on function public.get_rep_visibility(uuid, text) from public, anon, authenticated;
revoke execute on function public.has_permission(uuid, text)     from public, anon, authenticated;

-- After this pair of migrations, no SECURITY DEFINER function in `public` is
-- executable by `anon`, and of the eleven still reachable by `authenticated`
-- nine carry an internal authorisation check. The two that do not are
-- deliberate: current_company_id() returns only the caller's own company, and
-- refresh_niche_benchmarks() writes anonymised cross-company aggregates and
-- self-rate-limits to once every six hours.
--
-- Confirmed after applying that service_role can still execute every function
-- revoked here and in 20260831130000 - the Stripe webhook path
-- (activate_rental / release_rental) and the SMS credit path are unaffected.

notify pgrst, 'reload schema';
