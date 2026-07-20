-- ============================================================================
-- Go live with HVAC, Roofing and Renovations
--
--   1. Flip these three niches from 'coming_soon' → 'live' so the homepage
--      trade picker links them to their new /<slug>-leads pages.
--   2. Seed a starter fleet of rentable assets for each (idempotent per niche —
--      only seeds a niche that has no assets yet), so the fleet page and the
--      availability counter show real inventory the moment they go live.
-- ============================================================================

update niches set status = 'live'
where slug in ('hvac', 'roofing', 'renovations');

insert into assets (
  niche_id, region_id, tier, brand_name, brand_domain,
  monthly_price_aud, floor_leads, typical_min, typical_max, status
)
select
  n.id, r.id, v.tier, v.brand_name, v.brand_domain,
  v.price, v.floor, v.tmin, v.tmax, 'available'
from (values
  -- niche,        region,       tier,      brand_name,                    brand_domain,                       price, floor, tmin, tmax
  ('hvac',        'brisbane',   'starter', 'Brisbane Aircon Quotes',      'brisbaneairconquotes.com.au',      1200, 10, 10, 14),
  ('hvac',        'sydney',     'growth',  'Sydney Climate Control',      'sydneyclimatecontrol.com.au',      2400, 20, 20, 28),
  ('hvac',        'melbourne',  'starter', 'Melbourne Heating & Cooling', 'melbourneheatingcooling.com.au',   1200, 10, 10, 14),
  ('hvac',        'gold-coast', 'growth',  'Gold Coast Air Solutions',    'goldcoastairsolutions.com.au',     2400, 20, 20, 28),

  ('roofing',     'brisbane',   'starter', 'Brisbane Roof Quotes',        'brisbaneroofquotes.com.au',        1200, 10, 10, 14),
  ('roofing',     'sydney',     'starter', 'Sydney Roof Restore',         'sydneyroofrestore.com.au',         1200, 10, 10, 14),
  ('roofing',     'melbourne',  'growth',  'Melbourne Roofing Deals',     'melbourneroofingdeals.com.au',     2400, 20, 20, 28),
  ('roofing',     'gold-coast', 'scale',   'Gold Coast Roofing Pros',     'goldcoastroofingpros.com.au',      3600, 30, 30, 42),

  ('renovations', 'sydney',     'starter', 'Sydney Reno Quotes',          'sydneyrenoquotes.com.au',          1200, 10, 10, 14),
  ('renovations', 'melbourne',  'growth',  'Melbourne Home Renovations',  'melbournehomerenovations.com.au',  2400, 20, 20, 28),
  ('renovations', 'brisbane',   'growth',  'Brisbane Reno Co',            'brisbanerenoco.com.au',            2400, 20, 20, 28),
  ('renovations', 'gold-coast', 'starter', 'Gold Coast Renovations',      'goldcoastrenovations.com.au',      1200, 10, 10, 14)
) as v(niche_slug, region_slug, tier, brand_name, brand_domain, price, floor, tmin, tmax)
join niches  n on n.slug = v.niche_slug
join regions r on r.slug = v.region_slug
where not exists (
  select 1 from assets a
  join niches n2 on n2.id = a.niche_id
  where n2.slug = v.niche_slug
);
