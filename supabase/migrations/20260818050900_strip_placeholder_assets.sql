-- ============================================================================
-- Strip the placeholder brands out of the marketplace.
--
-- Every asset currently in the table is a placeholder seeded during build-out
-- (20260720180100_purge_fakes_seed_solar_sites.sql seeded three solar brands,
-- 20260721140000_seed_all_areas.sql fanned them across every region). Real
-- brands will be seeded from the admin panel when they're ready, so the fleet
-- goes back to an empty, "coming soon" state until then.
--
-- Nothing paid is being removed: rentals and asset_leads are empty, and the
-- only rental_checkouts rows are abandoned test checkouts that never reached
-- Stripe. Niches, regions and postcodes are left intact - only the assets and
-- the rows hanging off them go.
-- ============================================================================

-- Dependent rows first (asset_leads and rentals are ON DELETE RESTRICT).
delete from asset_leads;
delete from rentals;
delete from rental_checkouts;
delete from assets;
