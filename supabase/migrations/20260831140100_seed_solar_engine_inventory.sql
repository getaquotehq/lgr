-- ============================================================================
-- Seed the solar fleet: one engine per brand per region, 3 x 36 = 108.
--
-- 20260818050900 stripped every asset to put the fleet back to "coming soon"
-- while the brands were being built. The brands exist now - three live funnel
-- sites, each with a page for all 36 region slugs (verified 1:1 against
-- regions.slug), so every row seeded here has a real page behind it:
--
--   starter  AU Solar Quotes       ausolarquotes.com.au       $1,100
--   growth   Clear Solar Quotes    clearsolarquotes.com.au    $2,200
--   scale    Premium Solar Quotes  premiumsolarquotes.com.au  $3,300
--
-- Prices are the ones already published on the trade pages, not the older
-- $1,200/$2,400/$3,600 the pre-strip seed used.
--
-- typical_min/typical_max are the original published ranges: 10-14 / 20-28 /
-- 30-42. Those work out at $79-$110 a lead on every tier, which is deliberate -
-- a tier is a service level, not a volume discount, so the per-lead economics
-- should not move between them. They are a TYPICAL RANGE and never a floor:
-- MODEL.md section 4 stands, nothing guarantees a number, and the copy that
-- publishes these says so on the same line.
--
-- Only solar is seeded. Battery has a niche row and a price list but no funnel
-- site, and submit-lead routes on brand_domain, so a battery engine would be a
-- listing with nothing behind it. It stays coming-soon until a battery funnel
-- exists - same rule that kept the fleet empty until now.
--
-- Idempotent: skips any (niche, region, tier) that already has a live asset, so
-- this is safe to re-run and safe alongside assets created by hand in Mission
-- Control.
-- ============================================================================
insert into public.assets
  (niche_id, region_id, tier, brand_name, brand_domain, monthly_price_aud,
   typical_min, typical_max, status, sold_out)
select (select id from public.niches where slug = 'solar'),
       r.id, b.tier, b.brand_name, b.brand_domain, b.price, b.tmin, b.tmax,
       'available',
       -- ACT-wide duplicates Canberra's postcodes (see 20260831140000), so it
       -- is listed but held back rather than competing with Canberra.
       (r.slug = 'australian-capital-territory')
  from public.regions r
 cross join (values
   ('starter','AU Solar Quotes',      'ausolarquotes.com.au',      1100, 10, 14),
   ('growth', 'Clear Solar Quotes',   'clearsolarquotes.com.au',   2200, 20, 28),
   ('scale',  'Premium Solar Quotes', 'premiumsolarquotes.com.au', 3300, 30, 42)
 ) as b(tier, brand_name, brand_domain, price, tmin, tmax)
 where not exists (
   select 1 from public.assets a
    where a.region_id = r.id
      and a.tier = b.tier
      and a.niche_id = (select id from public.niches where slug = 'solar')
      and a.deleted_at is null
 );
