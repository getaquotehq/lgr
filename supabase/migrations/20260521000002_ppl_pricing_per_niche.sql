-- Simplify ppl_pricing to per-niche (not per-niche+area)
-- Area/radius/postcodes are captured on the order, not priced separately

-- Remove area-based columns
alter table ppl_pricing
  drop column if exists area,
  drop column if exists min_quantity,
  drop column if exists max_quantity,
  drop column if exists is_active;

-- Clear old area-seeded rows
delete from ppl_pricing;

-- Drop old unique constraint, add per-niche unique
alter table ppl_pricing drop constraint if exists ppl_pricing_niche_area_key;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'ppl_pricing_niche_key'
  ) then
    alter table ppl_pricing add constraint ppl_pricing_niche_key unique (niche);
  end if;
end $$;

-- Seed per-niche pricing
insert into ppl_pricing (niche, price_per_lead) values
  ('solar',       85.00),
  ('roofing',     75.00),
  ('hvac',        70.00),
  ('renovation',  95.00),
  ('landscaping', 80.00)
on conflict (niche) do update set price_per_lead = excluded.price_per_lead;

-- Add location fields to ppl_lead_orders
alter table ppl_lead_orders
  add column if not exists area_city     text,
  add column if not exists radius_km     int,
  add column if not exists postcode_list text,
  add column if not exists location_type text default 'radius';
