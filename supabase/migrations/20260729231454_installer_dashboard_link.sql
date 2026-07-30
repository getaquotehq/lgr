-- ============================================================================
-- Link paid rentals to dashboard accounts, and close a live RLS gap found
-- while building this: several policies named "admin ..." actually had
-- `qual = true` for role `authenticated` - i.e. ANY logged-in user, not just
-- admins. That was harmless while the only account was staff (verified: one
-- profile exists, is_admin = true). It stops being harmless the moment renter
-- self-service accounts exist, which is exactly what this migration enables -
-- so the two are fixed together.
--
-- Everything here is additive/idempotent (safe to re-run).
-- ============================================================================

-- 1. Link an installer (created by activate_rental, keyed by email) to the
--    dashboard account (companies/profiles, keyed by auth user) that owns it.
alter table installers add column if not exists company_id uuid references companies(id) on delete set null;
create index if not exists installers_company_idx on installers(company_id);

-- 2. Let a renter see their own installer row and their own rentals. Only
--    SELECT - installers/rentals are otherwise written by the service role
--    (webhook) or the super-admin-all policies already in place.
drop policy if exists "own installer row" on installers;
create policy "own installer row" on installers
  for select to authenticated
  using (company_id = current_company_id());

drop policy if exists "own rentals" on rentals;
create policy "own rentals" on rentals
  for select to authenticated
  using (installer_id in (select id from installers where company_id = current_company_id()));

-- 3. Let a renter see their own delivered leads (asset_leads.installer_id).
--    The prior "admin all leads" policy had qual = true for authenticated -
--    every homeowner lead in the system, for every business, readable and
--    writable by anyone with a login. Split into a real admin-only ALL policy
--    plus a scoped SELECT for the owning installer's leads.
drop policy if exists "admin all leads" on asset_leads;
create policy "super admin all leads" on asset_leads
  for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
create policy "own leads" on asset_leads
  for select to authenticated
  using (installer_id in (select id from installers where company_id = current_company_id()));

-- 4. Same "admin ... but qual = true" pattern on the remaining back-office
--    tables. None of these need renter access (they're ops/abuse-detection
--    data, not something a dashboard user's own account should expose), so
--    these are tightened to genuinely admin-only rather than given a scoped
--    renter policy.
drop policy if exists "admin read abuse log" on lead_abuse_log;
create policy "super admin read abuse log" on lead_abuse_log
  for select to authenticated using (is_super_admin());

drop policy if exists "admin read abuse visitors" on lead_abuse_visitors;
create policy "super admin read abuse visitors" on lead_abuse_visitors
  for select to authenticated using (is_super_admin());

drop policy if exists "admin all lead_delivery_log" on lead_delivery_log;
create policy "super admin all lead_delivery_log" on lead_delivery_log
  for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

drop policy if exists "admin read submissions" on lead_submissions;
create policy "super admin read submissions" on lead_submissions
  for select to authenticated using (is_super_admin());

drop policy if exists "admin all rental_checkouts" on rental_checkouts;
create policy "super admin all rental_checkouts" on rental_checkouts
  for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
