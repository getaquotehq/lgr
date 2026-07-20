-- ============================================================================
-- Clean slate: remove every placeholder ("fake") asset that was seeded during
-- build-out, then seed the three REAL solar landing-page brands as rentable,
-- area-exclusive assets — one asset per brand × region.
--
--   Brands (each is a live site the funnel lives on):
--     premiumsolarquotes.com.au  → Premium Solar Quotes  (scale  tier)
--     clearsolarquotes.com.au    → Clear Solar Quotes    (growth tier)
--     ausolarquotes.com.au       → AU Solar Quotes        (starter tier)
--
--   Regions: brisbane, sydney, melbourne, gold-coast (postcodes seeded in
--   20260720180000_region_postcodes.sql). Each asset inherits its region's
--   postcodes as its exclusive patch (assets.service_postcodes left NULL).
--
-- 3 brands × 4 regions = 12 assets, all 'available'. The same domain across
-- four regions is intentional: submit-lead disambiguates by postcode + the
-- brand named in the lead's consent text (ql-mc-style consent-bound routing).
-- ============================================================================

-- 1. Purge all existing assets and their dependent rows (FKs are ON DELETE
--    RESTRICT, so children go first). Installers are kept.
delete from leads;
delete from rentals;
delete from rental_checkouts;
delete from assets;

-- 2. Seed the 12 real solar assets.
insert into assets (
  niche_id, region_id, tier, brand_name, brand_domain,
  monthly_price_aud, floor_leads, typical_min, typical_max, status
)
select
  n.id, r.id, b.tier, b.brand_name, b.brand_domain,
  b.price, b.floor, b.tmin, b.tmax, 'available'
from (values
  ('premiumsolarquotes.com.au', 'Premium Solar Quotes', 'scale',   3600, 30, 30, 42),
  ('clearsolarquotes.com.au',   'Clear Solar Quotes',   'growth',  2400, 20, 20, 28),
  ('ausolarquotes.com.au',      'AU Solar Quotes',      'starter', 1200, 10, 10, 14)
) as b(brand_domain, brand_name, tier, price, floor, tmin, tmax)
cross join (values ('brisbane'), ('sydney'), ('melbourne'), ('gold-coast')) as reg(region_slug)
join niches  n on n.slug = 'solar'
join regions r on r.slug = reg.region_slug;
