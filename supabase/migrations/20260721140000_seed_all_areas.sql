-- ============================================================================
-- Seed every QuoteLeads area as rentable solar inventory.
--
-- Extends coverage from the original 4 regions to all 36 areas in the
-- quoteleads.com.au /buy-leads selector (metros + regional cities + state-wide).
-- Each NEW region gets one asset per brand, mirroring the existing
-- starter/growth/scale line-up:
--     AU Solar Quotes      starter  $1200  floor 10  (10-14)
--     Clear Solar Quotes   growth   $2400  floor 20  (20-28)
--     Premium Solar Quotes scale    $3600  floor 30  (30-42)
--
-- Coverage stays CLIENT-driven: regions are seeded with empty postcodes, and a
-- renter's own postcode list (assets.service_postcodes) is what submit-lead
-- matches against once an asset is rented. Until then, area-page leads are held
-- as pending. Idempotent: existing regions/assets are left untouched.
-- ============================================================================

-- 1) new regions (skip any slug that already exists) ─────────────────────────
insert into regions (slug, name, state, sort_order)
select v.slug, v.name, v.state, v.sort_order
from (values
  ('sunshine-coast','Sunshine Coast','QLD',5),
  ('toowoomba','Toowoomba','QLD',6),
  ('cairns','Cairns','QLD',7),
  ('rockhampton','Rockhampton','QLD',8),
  ('bundaberg','Bundaberg','QLD',9),
  ('hervey-bay','Hervey Bay','QLD',10),
  ('queensland','Queensland','QLD',11),
  ('newcastle','Newcastle','NSW',12),
  ('wollongong','Wollongong','NSW',13),
  ('central-coast','Central Coast','NSW',14),
  ('albury-wodonga','Albury/Wodonga','NSW',15),
  ('tamworth','Tamworth','NSW',16),
  ('coffs-harbour','Coffs Harbour','NSW',17),
  ('port-macquarie','Port Macquarie','NSW',18),
  ('new-south-wales','New South Wales','NSW',19),
  ('geelong','Geelong','VIC',20),
  ('shepparton','Shepparton','VIC',21),
  ('mildura','Mildura','VIC',22),
  ('frankston-mornington-peninsula','Frankston / Mornington Peninsula','VIC',23),
  ('dandenong','Dandenong','VIC',24),
  ('bendigo','Bendigo','VIC',25),
  ('ballarat','Ballarat','VIC',26),
  ('warragul','Warragul','VIC',27),
  ('victoria','Victoria','VIC',28),
  ('perth','Perth','WA',29),
  ('mandurah','Mandurah','WA',30),
  ('bunbury','Bunbury','WA',31),
  ('western-australia','Western Australia','WA',32),
  ('adelaide','Adelaide','SA',33),
  ('south-australia','South Australia','SA',34),
  ('canberra','Canberra','ACT',35),
  ('australian-capital-territory','Australian Capital Territory','ACT',36)
) as v(slug,name,state,sort_order)
where not exists (select 1 from regions r where r.slug = v.slug);

-- 2) one asset per brand for every region that has no active assets yet ───────
insert into assets
  (niche_id, region_id, tier, brand_name, brand_domain,
   monthly_price_aud, floor_leads, typical_min, typical_max, status)
select
  (select id from niches where slug='solar'),
  r.id, b.tier, b.brand_name, b.brand_domain,
  b.price, b.floor, b.tmin, b.tmax, 'available'
from regions r
cross join (values
  ('starter','AU Solar Quotes','ausolarquotes.com.au',1200,10,10,14),
  ('growth','Clear Solar Quotes','clearsolarquotes.com.au',2400,20,20,28),
  ('scale','Premium Solar Quotes','premiumsolarquotes.com.au',3600,30,30,42)
) as b(tier,brand_name,brand_domain,price,floor,tmin,tmax)
where not exists (
  select 1 from assets a where a.region_id = r.id and a.deleted_at is null
);
