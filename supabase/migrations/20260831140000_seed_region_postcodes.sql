-- ============================================================================
-- Give every region its postcodes. Without this, nothing can ever be delivered.
--
-- submit-lead gates a lead on the asset's effective service area:
--     effective = assets.service_postcodes, else regions.postcodes
-- and an EMPTY patch means "no coverage", not "everywhere" (see served() in
-- supabase/functions/submit-lead/index.ts - `patch.includes(postcode)` on an
-- empty array is false for every postcode). postcode-lookup applies the same
-- rule to decide whose name goes on the consent line.
--
-- Every one of the 36 regions had zero postcodes and no asset had an override.
-- So the live system was in this state: a homeowner types a postcode, the page
-- says "we'll match you when an installer covers your area", the consent line
-- names nobody, and submit-lead holds the submission as pending forever. A
-- renter could have paid and never received a lead. This is the launch blocker,
-- and it is invisible until someone actually submits a form.
--
-- The mapping is not invented here. It is the PC_METRO / PC_STATE table the
-- trade pages already use to tell a visitor which area they are in - metro
-- ranges first, then state-wide by leading digit, so an unmatched Queensland
-- postcode falls to "Queensland" rather than a random city. Copying it into the
-- database is what makes the page's answer and the backend's answer agree.
--
-- Two corrections were needed on the way, both verified after applying:
--
--   1. Narrowest range wins, not lowest. Melbourne (3000-3207) contains
--      Dandenong (3175) and Frankston/Mornington (3199-3201), so a lowest-first
--      assignment gave those two regions nothing at all. The JS has the same
--      bug for the same reason - PC_METRO is scanned in array order and the
--      Melbourne row comes first - and is fixed there by moving the specific
--      rows above it.
--   2. australian-capital-territory covers exactly Canberra's postcodes.
--      Listing both as sellable would put two engines on one patch, so ACT-wide
--      is held back via the existing sold_out flag and Canberra sells.
--
-- Result: 7000 postcodes assigned across 35 regions, zero assigned twice.
--   3175 -> dandenong, 3200 -> frankston-mornington-peninsula,
--   3000 -> melbourne, 4310 -> queensland (the page's own worked example).
--
-- Renters can still narrow their own patch afterwards: assets.service_postcodes
-- overrides the region list, and Mission Control edits it per asset.
-- ============================================================================
with metro(lo, hi, slug) as (values
  (2000,2249,'sydney'),(2555,2574,'sydney'),(2740,2786,'sydney'),
  (2250,2263,'central-coast'),(2280,2310,'newcastle'),(2500,2530,'wollongong'),
  (2600,2620,'canberra'),(2900,2920,'canberra'),
  (2340,2349,'tamworth'),(2440,2447,'port-macquarie'),(2448,2456,'coffs-harbour'),(2640,2641,'albury-wodonga'),
  (3000,3207,'melbourne'),(3335,3341,'melbourne'),(3427,3442,'melbourne'),(3750,3810,'melbourne'),(3910,3920,'melbourne'),(3975,3980,'melbourne'),
  (3175,3175,'dandenong'),(3199,3201,'frankston-mornington-peninsula'),(3211,3230,'geelong'),
  (3350,3360,'ballarat'),(3550,3564,'bendigo'),(3500,3509,'mildura'),(3630,3639,'shepparton'),(3820,3825,'warragul'),
  (4000,4206,'brisbane'),(4300,4305,'brisbane'),(4207,4287,'gold-coast'),
  (4350,4361,'toowoomba'),(4550,4575,'sunshine-coast'),(4655,4662,'hervey-bay'),(4670,4676,'bundaberg'),(4700,4709,'rockhampton'),(4870,4879,'cairns'),
  (5000,5199,'adelaide'),(5800,5999,'adelaide'),
  (6000,6199,'perth'),(6800,6997,'perth'),(6210,6214,'mandurah'),(6230,6237,'bunbury')
),
st(d, slug) as (values
  ('2','new-south-wales'),('3','victoria'),('8','victoria'),
  ('4','queensland'),('9','queensland'),
  ('5','south-australia'),('6','western-australia')
),
pc as (select generate_series(1000, 9999) as n),
metro_assign as (
  select p.n,
         (select m.slug from metro m
           where p.n between m.lo and m.hi
           order by (m.hi - m.lo) asc, m.lo asc limit 1) as slug
  from pc p
),
assigned as (
  select n, slug from metro_assign where slug is not null
  union all
  select ma.n, s.slug
    from metro_assign ma join st s on s.d = left(lpad(ma.n::text, 4, '0'), 1)
   where ma.slug is null
)
update public.regions r
   set postcodes = coalesce(a.arr, '{}')
  from (select slug, array_agg(lpad(n::text,4,'0') order by n) as arr from assigned group by slug) a
 where r.slug = a.slug;

update public.regions set postcodes = '{}' where slug = 'australian-capital-territory';
