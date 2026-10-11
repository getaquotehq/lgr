-- ============================================================================
-- LGR sells solar and solar battery only. Hard-delete every other trade and
-- everything hanging off it: hvac, roofing, renovations.
--
-- Order follows the foreign keys: guarantee cycles, leads and rentals all
-- restrict deletion of their engine, and engines restrict deletion of their
-- niche. rental_checkouts and lead_assignments would only null their asset_id,
-- so they are deleted outright to leave nothing behind.
--
-- Runs as one transaction: if anything still references one of these engines,
-- the whole migration fails and nothing is deleted.
-- ============================================================================
begin;

create temp table doomed_assets on commit drop as
  select a.id
    from public.assets a
    join public.niches n on n.id = a.niche_id
   where n.slug not in ('solar', 'battery');

delete from public.guarantee_cycles where asset_id in (select id from doomed_assets);
delete from public.leads            where asset_id in (select id from doomed_assets);
delete from public.rentals          where asset_id in (select id from doomed_assets);
delete from public.rental_checkouts where asset_id in (select id from doomed_assets);
delete from public.lead_assignments where first_asset_id in (select id from doomed_assets);
delete from public.assets           where id in (select id from doomed_assets);
delete from public.niches           where slug not in ('solar', 'battery');

commit;

notify pgrst, 'reload schema';
