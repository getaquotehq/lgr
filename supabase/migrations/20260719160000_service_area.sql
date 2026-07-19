-- ============================================================================
-- Service-area (territory) gate for asset funnels.
--
-- LGR assets are rented exclusively, so there is no routing decision — but a
-- funnel should only accept leads from its own patch. submit-lead checks the
-- lead's postcode against the asset's effective service area:
--     effective = assets.service_postcodes  (if set, an override)
--               ELSE regions.postcodes       (the region's default patch)
-- Empty/NULL list = no gate (accept every postcode). Out-of-area leads are
-- stored as status='invalid' (flagged out_of_area) so they're visible but never
-- delivered and never count toward floor.
-- ============================================================================

-- Region's default serviced postcodes (empty = no gate for that region).
alter table regions add column if not exists postcodes text[] not null default '{}';

-- Optional per-asset override (NULL = inherit the region's list).
alter table assets add column if not exists service_postcodes text[];
