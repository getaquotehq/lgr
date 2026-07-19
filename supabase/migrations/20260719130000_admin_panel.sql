-- ============================================================================
-- Admin panel (lgr-mc) support
--
--   1. Soft-delete for assets  (deleted_at) - the admin never hard-deletes an
--      asset, it stamps deleted_at so history/leads/rentals stay intact.
--   2. Admin RLS: authenticated users (the mission-control operators, created
--      manually in Supabase Auth) get full CRUD on every table. The public
--      site keeps using the anon key + insert_lead() and is unaffected.
--
-- Model: anon = public website (read catalog, call insert_lead only).
--        authenticated = LGR admin operator (full access via lgr-mc).
-- If installer-facing auth is ever added, tighten these `to authenticated`
-- policies to an explicit admin claim.
-- ============================================================================

-- 1. Soft-delete column -------------------------------------------------------
alter table assets add column if not exists deleted_at timestamptz;
create index if not exists assets_deleted_at_idx on assets(deleted_at);

-- The public catalog must never surface a soft-deleted asset. Replace the
-- open "public read assets" policy with one that hides deleted rows.
drop policy if exists "public read assets" on assets;
create policy "public read assets" on assets
  for select to anon, authenticated
  using (deleted_at is null);

-- 2. Admin (authenticated) full-access policies ------------------------------
-- niches / regions / assets: authenticated already has SELECT via the public
-- policies above; add write access for admins.
drop policy if exists "admin write niches"  on niches;
drop policy if exists "admin write regions" on regions;
drop policy if exists "admin all assets"    on assets;

create policy "admin write niches" on niches
  for all to authenticated using (true) with check (true);
create policy "admin write regions" on regions
  for all to authenticated using (true) with check (true);
-- assets: admins see & mutate everything, including soft-deleted rows.
create policy "admin all assets" on assets
  for all to authenticated using (true) with check (true);

-- installers / leads / rentals: were service-role only. Give admins full CRUD.
drop policy if exists "admin all installers" on installers;
drop policy if exists "admin all leads"      on leads;
drop policy if exists "admin all rentals"    on rentals;

create policy "admin all installers" on installers
  for all to authenticated using (true) with check (true);
create policy "admin all leads" on leads
  for all to authenticated using (true) with check (true);
create policy "admin all rentals" on rentals
  for all to authenticated using (true) with check (true);

-- Table privileges to match the new policies (RLS still governs row access).
grant select, insert, update, delete on niches, regions, assets to authenticated;
grant select, insert, update, delete on installers, leads, rentals to authenticated;
