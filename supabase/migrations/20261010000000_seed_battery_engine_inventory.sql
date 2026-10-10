-- ============================================================================
-- Seed the battery fleet: one engine per brand per region, 3 x 36 = 108.
--
-- 20260831140100 left battery unseeded because there was no battery funnel
-- behind it. There is now: each of the three solar brands has a
-- /battery/<region>/ page for all 36 region slugs (plus a /battery/ hub), and
-- those pages post niche='battery' with the brand's own domain, so
-- submit-lead routes them here rather than to the solar engines on the same
-- domain:
--
--   AU Solar Quotes       ausolarquotes.com.au       /battery/<region>/
--   Clear Solar Quotes    clearsolarquotes.com.au    /battery/<region>/
--   Premium Solar Quotes  premiumsolarquotes.com.au  /battery/<region>/
--
-- Priced on the managed engine model (20260916000000): every engine is tier
-- 'engine' at $1,250 ex GST, $50/day committed Meta budget on the client's own
-- card, 10 quotes guaranteed per 30-day cycle. Brand has nothing to do with
-- price. $1,250 is also what solar-battery-leads.html already publishes, which
-- retires the old 950/1850/2750 battery price list from 20260830120000.
--
-- typical_min/typical_max are internal forecasting only (Mission Control says
-- "Not published") and copy the solar engine's 10-14.
--
-- Idempotent: skips any (battery, region, brand_domain) that already has a
-- live asset, so it is safe to re-run and safe alongside battery engines
-- created by hand in Mission Control.
-- ============================================================================
insert into public.assets
  (niche_id, region_id, tier, brand_name, brand_domain, monthly_price_aud,
   min_daily_budget_aud, guarantee_quotes, guarantee_window_days,
   typical_min, typical_max, status, sold_out)
select (select id from public.niches where slug = 'battery'),
       r.id, 'engine', b.brand_name, b.brand_domain,
       1250, 50, 10, 30,
       10, 14,
       'available',
       -- ACT-wide duplicates Canberra's postcodes (see 20260831140000), so it
       -- is listed but held back rather than competing with Canberra.
       (r.slug = 'australian-capital-territory')
  from public.regions r
 cross join (values
   ('AU Solar Quotes',      'ausolarquotes.com.au'),
   ('Clear Solar Quotes',   'clearsolarquotes.com.au'),
   ('Premium Solar Quotes', 'premiumsolarquotes.com.au')
 ) as b(brand_name, brand_domain)
 where (select id from public.niches where slug = 'battery') is not null
   and not exists (
   select 1 from public.assets a
    where a.region_id = r.id
      and a.brand_domain = b.brand_domain
      and a.niche_id = (select id from public.niches where slug = 'battery')
      and a.deleted_at is null
 );
