-- Restore per-niche+area pricing on ppl_pricing.
-- Existing niche-only rows become area=NULL (the default/fallback price).
-- create-ppl-checkout will try niche+area first, fall back to area IS NULL.

alter table ppl_pricing add column if not exists area text;

-- Drop old per-niche-only unique constraint
alter table ppl_pricing drop constraint if exists ppl_pricing_niche_key;

-- One default row per niche (area IS NULL)
create unique index if not exists ppl_pricing_niche_default_idx
  on ppl_pricing(niche) where area is null;

-- One area-specific row per niche+area pair
create unique index if not exists ppl_pricing_niche_area_idx
  on ppl_pricing(niche, area) where area is not null;
