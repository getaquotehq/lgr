-- ============================================================================
-- Engine identity is not public. It is revealed when a slot is paid for.
--
-- `assets` carries two identity columns - brand_name and brand_domain - which
-- together name the live landing page a homeowner lands on. Until now the
-- public catalogue policy handed both to `anon` on request: every engine
-- domain in the fleet could be read straight off the anon key, and /fleet
-- printed each one into the address bar of the mock browser on the card.
--
-- The domain is the whole attack surface of an engine. With it, a competitor
-- or a disgruntled ex-renter can pour junk submissions into a page whose ad
-- spend we fund and whose leads a paying renter is relying on, mass-report the
-- ads to the platform, or clone the funnel wholesale. The anti-spam work makes
-- each junk submission harder to land; it does not make knowing the target
-- harmless, and none of it helps at all against a report or a clone.
--
-- Note that hiding the domain in the page would have been theatre on its own:
-- the leak is the anon-key read, not the markup. This migration closes the
-- read, and the page changes follow it rather than standing in for it.
--
-- After this migration:
--   * anon reads public.assets_public - a catalogue view carrying trade, area,
--     tier, price and availability, and nothing that names the engine.
--   * an authenticated renter reads the full asset row for the engines they
--     hold a live rental on, and only those. That is the paid reveal.
--   * a logged-in account with no live rental sees exactly what anon sees.
--     Signing up for a free dashboard account must not be a way around this.
--   * super admins are unchanged - Mission Control still reads and writes the
--     base table under "super admin all assets".
--
-- Nothing server-side is affected: submit-lead, postcode-lookup, deliver-lead
-- and the Stripe handlers all run on the service role, which bypasses RLS, and
-- the engine sites themselves only ever call edge functions.
-- ============================================================================

-- 1. The catalogue view -------------------------------------------------------
-- Deliberately an include-list, not "select * except". A column added to
-- `assets` later is private until somebody writes it into this list on purpose,
-- which is the safe direction for the default to fall.
--
-- security_invoker is off (the default) so the view runs as its owner and does
-- not need a SELECT policy on `assets` for anon. The view body carries the
-- deleted_at filter the old public policy used to.
--
-- Supabase's linter raises `security_definer_view` (ERROR) on this, and that is
-- expected here rather than a defect: the projection above IS the security
-- boundary, and it is an include-list of columns that are public by intent.
-- Do NOT "fix" the advisor by setting security_invoker = true - anon has no
-- SELECT policy on `assets` any more, so the view would return nothing and
-- /fleet would go blank.
-- The join to niches/regions is flattened into the view rather than left to
-- PostgREST's view-embedding inference. Both are public catalogue tables and
-- every caller wanted the slug and name anyway, so this costs nothing and means
-- the fleet page does not depend on relationship detection through a view.
drop view if exists public.assets_public;
create view public.assets_public as
  select a.id,
         a.tier,
         a.monthly_price_aud,
         a.typical_min,
         a.typical_max,
         a.status,
         a.sold_out,
         a.created_at,
         a.niche_id,
         n.slug        as niche_slug,
         n.name        as niche_name,
         a.region_id,
         r.slug        as region_slug,
         r.name        as region_name,
         r.state       as region_state,
         r.sort_order  as region_sort_order
    from public.assets a
    join public.niches  n on n.id = a.niche_id
    join public.regions r on r.id = a.region_id
   where a.deleted_at is null;

comment on view public.assets_public is
  'Public engine catalogue. Trade, area, tier, price and availability only - '
  'never brand_name, brand_domain or anything else that identifies the live '
  'landing page. Engine identity is revealed to a renter after payment, via '
  'the "renter reads own engines" policy on assets.';

-- Supabase's default privileges grant ALL on new public-schema relations to
-- anon and authenticated, and that includes views. This view joins three
-- tables so Postgres will not treat it as auto-updatable and a write through it
-- fails anyway - but the grant should not be sitting there implying otherwise.
revoke all on public.assets_public from anon, authenticated;
grant select on public.assets_public to anon, authenticated;

-- 2. Close the anon read of the base table -----------------------------------
drop policy if exists "public read assets" on public.assets;
revoke select on public.assets from anon;

-- 3. The paid reveal ----------------------------------------------------------
-- Keyed off a live rental rather than assets.rented_by: `rentals` is the record
-- written when Stripe confirms payment, so "has paid" and "can see it" are the
-- same condition by construction. When the shared-slot model in MODEL.md §1
-- lands, several renters will match this policy on one asset, which is correct
-- and needs no change here.
drop policy if exists "renter reads own engines" on public.assets;
create policy "renter reads own engines" on public.assets
  for select to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
        from public.rentals r
        join public.installers i on i.id = r.installer_id
       where r.asset_id = assets.id
         and r.ended_at is null
         and i.company_id = public.current_company_id()
    )
  );

notify pgrst, 'reload schema';
