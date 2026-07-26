-- Sub-niche support for HVAC, Roofing, and Renovation
-- Solar is left untouched. Sub-niche is optional; no selection = parent niche price.

-- 1. Add sub_niche column to ppl_pricing
alter table ppl_pricing add column if not exists sub_niche text;

-- 2. Drop old partial unique indexes and recreate to include sub_niche
drop index if exists ppl_pricing_niche_default_idx;
drop index if exists ppl_pricing_niche_area_idx;

-- Default row per (niche, sub_niche) where area IS NULL
create unique index if not exists ppl_pricing_niche_subniche_default_idx
  on ppl_pricing (niche, coalesce(sub_niche, '')) where area is null;

-- Area-specific row per (niche, sub_niche, area)
create unique index if not exists ppl_pricing_niche_subniche_area_idx
  on ppl_pricing (niche, coalesce(sub_niche, ''), area) where area is not null;

-- 3. Add sub_niche to ppl_lead_orders
alter table ppl_lead_orders add column if not exists sub_niche text;

-- 4. Add sub_niche to signup_attempts
alter table signup_attempts add column if not exists sub_niche text;

-- 5. Seed sub-niche default pricing rows (area = null = all cities)
insert into ppl_pricing (niche, sub_niche, price_per_lead) values
  -- HVAC sub-niches (same price as parent $70)
  ('hvac', 'split_ducted',              70.00),
  ('hvac', 'installations_maintenance', 70.00),
  -- Roofing sub-niches (different pricing per type)
  ('roofing', 'all_restorations', 70.00),
  ('roofing', 'all_replacements', 85.00),
  ('roofing', 'tile_metal',      125.00),
  -- Renovation sub-niches (same price as parent $95)
  ('renovation', 'kitchen',  95.00),
  ('renovation', 'bathroom', 95.00)
on conflict do nothing;
