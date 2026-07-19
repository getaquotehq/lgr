-- ============================================================================
-- Seed data (idempotent - safe to re-run)
-- ============================================================================

-- Niches ---------------------------------------------------------------------
insert into niches (slug, name, short_desc, status, sort_order) values
  ('solar',       'Residential Solar', 'Homeowners actively pricing solar and battery installs',   'live',        1),
  ('hvac',        'HVAC',              'Ducted and split-system heating and cooling enquiries',     'coming_soon', 2),
  ('roofing',     'Roofing',           'Restoration, replacement and repair enquiries',             'coming_soon', 3),
  ('renovations', 'Renovations',       'Full-home, bathroom and kitchen renovation enquiries',      'coming_soon', 4)
on conflict (slug) do nothing;

-- Regions --------------------------------------------------------------------
insert into regions (slug, name, state, sort_order) values
  ('brisbane',  'Brisbane',   'QLD', 1),
  ('sydney',    'Sydney',     'NSW', 2),
  ('melbourne', 'Melbourne',  'VIC', 3),
  ('gold-coast','Gold Coast', 'QLD', 4)
on conflict (slug) do nothing;

-- Installers -----------------------------------------------------------------
insert into installers (business_name, contact_name, email, phone) values
  ('Sunrun Solar Co',        'Dave Nguyen',  'ops@sunrunsolar.com.au',   '0400 111 222'),
  ('Bright Spark Electrical','Mia Roberts',  'hello@brightspark.com.au', '0400 333 444')
on conflict (email) do nothing;

-- Assets (solar only for now) - only seeded when the table is empty -----------
insert into assets (
  niche_id, region_id, tier, brand_name, brand_domain,
  monthly_price_aud, floor_leads, typical_min, typical_max,
  status, rented_by, rented_until
)
select
  n.id, r.id, v.tier, v.brand_name, v.brand_domain,
  v.price, v.floor, v.tmin, v.tmax, v.status,
  i.id,
  case when v.rented_email is null then null else (current_date + 20) end
from (values
  -- niche, region,      tier,      brand_name,                  brand_domain,                      price, floor, tmin, tmax, status,      rented_email
  ('solar','brisbane',  'starter', 'Brisbane Solar Quotes',     'brisbanesolarquotes.com.au',      1200, 10, 10, 14, 'available', null),
  ('solar','brisbane',  'growth',  'SEQ Solar Deals',           'seqsolardeals.com.au',            2400, 20, 20, 28, 'rented',    'ops@sunrunsolar.com.au'),
  ('solar','sydney',    'starter', 'Sydney Solar Savings',      'sydneysolarsavings.com.au',       1200, 10, 10, 14, 'rented',    'hello@brightspark.com.au'),
  ('solar','sydney',    'growth',  'Harbour City Solar',        'harbourcitysolar.com.au',         2400, 20, 20, 28, 'available', null),
  ('solar','sydney',    'scale',   'Greater Sydney Solar',      'greatersydneysolar.com.au',       3600, 30, 30, 42, 'available', null),
  ('solar','melbourne', 'starter', 'Melbourne Solar Hub',       'melbournesolarhub.com.au',        1200, 10, 10, 14, 'available', null),
  ('solar','melbourne', 'growth',  'Victoria Solar Rebates',    'victoriasolarrebates.com.au',     2400, 20, 20, 28, 'available', null),
  ('solar','gold-coast','scale',   'Gold Coast Solar Pros',     'goldcoastsolarpros.com.au',       3600, 30, 30, 42, 'rented',    'ops@sunrunsolar.com.au'),
  ('solar','gold-coast','growth',  'GC Solar & Battery',        'gcsolarbattery.com.au',           2400, 20, 20, 28, 'available', null)
) as v(niche_slug, region_slug, tier, brand_name, brand_domain, price, floor, tmin, tmax, status, rented_email)
join niches  n on n.slug = v.niche_slug
join regions r on r.slug = v.region_slug
left join installers i on i.email = v.rented_email
where not exists (select 1 from assets);

-- Rental history rows for the currently-rented assets ------------------------
insert into rentals (asset_id, installer_id, monthly_price_aud, floor_leads, started_at)
select a.id, a.rented_by, a.monthly_price_aud, a.floor_leads, now() - interval '10 days'
from assets a
where a.status = 'rented'
  and a.rented_by is not null
  and not exists (select 1 from rentals);
