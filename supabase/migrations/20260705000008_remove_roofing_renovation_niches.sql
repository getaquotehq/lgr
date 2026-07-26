-- Remove roofing and renovation as sellable PPL niches. Only solar (incl.
-- solar+battery, battery-retrofit) and hvac remain.
--
-- Deletes the CONFIG rows that make these niches sellable/visible:
--   ppl_pricing      — no price row ⇒ the niche can't be priced or ordered
--   niche_benchmarks — display/benchmark config
--   ppl_campaigns    — campaign registry entries routing these niches
--
-- Intentionally NOT touched (historical / financial records):
--   ppl_lead_orders, signup_attempts, companies.niche

delete from public.ppl_pricing      where niche in ('roofing', 'renovation');
delete from public.niche_benchmarks where niche in ('roofing', 'renovation');
delete from public.ppl_campaigns    where niche in ('roofing', 'renovation');
