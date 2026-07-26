-- The /admin panel could not see or action PPL area change requests: the table
-- only had "own company" select/insert policies, so super-admins (whose own
-- company_id never matches a customer's) saw nothing and could not approve or
-- reject. Add super-admin SELECT + UPDATE using the recursion-safe helper,
-- matching the pattern already used on companies / ppl_lead_orders. Additive:
-- the existing pacr_select_own / pacr_insert_own policies are left intact so
-- customers keep reading and creating their own requests exactly as before.

drop policy if exists "pacr_admin_select" on public.ppl_area_change_requests;
create policy "pacr_admin_select" on public.ppl_area_change_requests
  for select
  using (public.is_super_admin());

drop policy if exists "pacr_admin_update" on public.ppl_area_change_requests;
create policy "pacr_admin_update" on public.ppl_area_change_requests
  for update
  using (public.is_super_admin())
  with check (public.is_super_admin());
