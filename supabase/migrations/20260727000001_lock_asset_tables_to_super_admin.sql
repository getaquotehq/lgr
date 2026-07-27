-- Re-scope the LGR rental tables from "any authenticated user" to super-admins.
-- The ql-hq port shares this Supabase project, so client dashboard users are now
-- `authenticated` here too; the original `using (true)` policies would have given
-- them full read/write over the fleet, rentals, installers and pending leads.
-- Public SELECT on assets/regions/niches is unchanged (brand sites read anon).

insert into public.companies (id, name, slug)
select gen_random_uuid(), 'Lead Gen Rentals (internal)', 'lead-gen-rentals-internal'
where not exists (select 1 from public.companies where slug = 'lead-gen-rentals-internal');

insert into public.profiles (id, company_id, full_name, role, user_type, is_admin)
select u.id,
       (select id from public.companies where slug = 'lead-gen-rentals-internal'),
       'Lead Gen Rentals', 'owner', 'internal', true
from auth.users u
where u.email = 'contact@leadgenrentals.com.au'
  and not exists (select 1 from public.profiles p where p.id = u.id);

update public.profiles set is_admin = true
where id in (select id from auth.users where email = 'contact@leadgenrentals.com.au');

drop policy if exists "admin all assets"     on public.assets;
drop policy if exists "admin write niches"   on public.niches;
drop policy if exists "admin write regions"  on public.regions;
drop policy if exists "admin all installers" on public.installers;
drop policy if exists "admin all rentals"    on public.rentals;
drop policy if exists "admin read pending"   on public.pending_leads;
drop policy if exists "admin update pending" on public.pending_leads;

create policy "super admin all assets" on public.assets for all
  to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin write niches" on public.niches for all
  to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin write regions" on public.regions for all
  to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin all installers" on public.installers for all
  to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin all rentals" on public.rentals for all
  to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin read pending" on public.pending_leads for select
  to authenticated using (public.is_super_admin());
create policy "super admin update pending" on public.pending_leads for update
  to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

notify pgrst, 'reload schema';
