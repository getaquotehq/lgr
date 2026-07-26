-- Ensure area column exists (idempotent — safe if 003 already ran)
alter table ppl_pricing add column if not exists area text;
alter table ppl_pricing drop constraint if exists ppl_pricing_niche_key;
create unique index if not exists ppl_pricing_niche_default_idx on ppl_pricing(niche) where area is null;
create unique index if not exists ppl_pricing_niche_area_idx on ppl_pricing(niche, area) where area is not null;

-- Seed per-city pricing rows for all 46 major AU cities × 5 niches.
-- Prices match the niche defaults set in 20260521000002.
-- Admin can edit individual rows in /admin after this runs.

insert into ppl_pricing (niche, area, price_per_lead) values
  -- Solar ($85)
  ('solar','Brisbane',85.00),('solar','Gold Coast',85.00),('solar','Sunshine Coast',85.00),
  ('solar','Toowoomba',85.00),('solar','Townsville',85.00),('solar','Cairns',85.00),
  ('solar','Rockhampton',85.00),('solar','Bundaberg',85.00),('solar','Mackay',85.00),
  ('solar','Hervey Bay',85.00),
  ('solar','Sydney',85.00),('solar','Newcastle',85.00),('solar','Wollongong',85.00),
  ('solar','Central Coast',85.00),('solar','Coffs Harbour',85.00),('solar','Port Macquarie',85.00),
  ('solar','Tamworth',85.00),('solar','Wagga Wagga',85.00),('solar','Albury',85.00),
  ('solar','Dubbo',85.00),('solar','Bathurst',85.00),('solar','Orange',85.00),
  ('solar','Melbourne',85.00),('solar','Geelong',85.00),('solar','Ballarat',85.00),
  ('solar','Bendigo',85.00),('solar','Shepparton',85.00),('solar','Mildura',85.00),
  ('solar','Warrnambool',85.00),('solar','Wodonga',85.00),
  ('solar','Perth',85.00),('solar','Mandurah',85.00),('solar','Bunbury',85.00),
  ('solar','Geraldton',85.00),('solar','Kalgoorlie',85.00),
  ('solar','Adelaide',85.00),('solar','Mount Gambier',85.00),('solar','Whyalla',85.00),
  ('solar','Port Augusta',85.00),
  ('solar','Canberra',85.00),
  ('solar','Hobart',85.00),('solar','Launceston',85.00),('solar','Devonport',85.00),('solar','Burnie',85.00),
  ('solar','Darwin',85.00),('solar','Alice Springs',85.00),

  -- Roofing ($75)
  ('roofing','Brisbane',75.00),('roofing','Gold Coast',75.00),('roofing','Sunshine Coast',75.00),
  ('roofing','Toowoomba',75.00),('roofing','Townsville',75.00),('roofing','Cairns',75.00),
  ('roofing','Rockhampton',75.00),('roofing','Bundaberg',75.00),('roofing','Mackay',75.00),
  ('roofing','Hervey Bay',75.00),
  ('roofing','Sydney',75.00),('roofing','Newcastle',75.00),('roofing','Wollongong',75.00),
  ('roofing','Central Coast',75.00),('roofing','Coffs Harbour',75.00),('roofing','Port Macquarie',75.00),
  ('roofing','Tamworth',75.00),('roofing','Wagga Wagga',75.00),('roofing','Albury',75.00),
  ('roofing','Dubbo',75.00),('roofing','Bathurst',75.00),('roofing','Orange',75.00),
  ('roofing','Melbourne',75.00),('roofing','Geelong',75.00),('roofing','Ballarat',75.00),
  ('roofing','Bendigo',75.00),('roofing','Shepparton',75.00),('roofing','Mildura',75.00),
  ('roofing','Warrnambool',75.00),('roofing','Wodonga',75.00),
  ('roofing','Perth',75.00),('roofing','Mandurah',75.00),('roofing','Bunbury',75.00),
  ('roofing','Geraldton',75.00),('roofing','Kalgoorlie',75.00),
  ('roofing','Adelaide',75.00),('roofing','Mount Gambier',75.00),('roofing','Whyalla',75.00),
  ('roofing','Port Augusta',75.00),
  ('roofing','Canberra',75.00),
  ('roofing','Hobart',75.00),('roofing','Launceston',75.00),('roofing','Devonport',75.00),('roofing','Burnie',75.00),
  ('roofing','Darwin',75.00),('roofing','Alice Springs',75.00),

  -- HVAC ($70)
  ('hvac','Brisbane',70.00),('hvac','Gold Coast',70.00),('hvac','Sunshine Coast',70.00),
  ('hvac','Toowoomba',70.00),('hvac','Townsville',70.00),('hvac','Cairns',70.00),
  ('hvac','Rockhampton',70.00),('hvac','Bundaberg',70.00),('hvac','Mackay',70.00),
  ('hvac','Hervey Bay',70.00),
  ('hvac','Sydney',70.00),('hvac','Newcastle',70.00),('hvac','Wollongong',70.00),
  ('hvac','Central Coast',70.00),('hvac','Coffs Harbour',70.00),('hvac','Port Macquarie',70.00),
  ('hvac','Tamworth',70.00),('hvac','Wagga Wagga',70.00),('hvac','Albury',70.00),
  ('hvac','Dubbo',70.00),('hvac','Bathurst',70.00),('hvac','Orange',70.00),
  ('hvac','Melbourne',70.00),('hvac','Geelong',70.00),('hvac','Ballarat',70.00),
  ('hvac','Bendigo',70.00),('hvac','Shepparton',70.00),('hvac','Mildura',70.00),
  ('hvac','Warrnambool',70.00),('hvac','Wodonga',70.00),
  ('hvac','Perth',70.00),('hvac','Mandurah',70.00),('hvac','Bunbury',70.00),
  ('hvac','Geraldton',70.00),('hvac','Kalgoorlie',70.00),
  ('hvac','Adelaide',70.00),('hvac','Mount Gambier',70.00),('hvac','Whyalla',70.00),
  ('hvac','Port Augusta',70.00),
  ('hvac','Canberra',70.00),
  ('hvac','Hobart',70.00),('hvac','Launceston',70.00),('hvac','Devonport',70.00),('hvac','Burnie',70.00),
  ('hvac','Darwin',70.00),('hvac','Alice Springs',70.00),

  -- Renovation ($95)
  ('renovation','Brisbane',95.00),('renovation','Gold Coast',95.00),('renovation','Sunshine Coast',95.00),
  ('renovation','Toowoomba',95.00),('renovation','Townsville',95.00),('renovation','Cairns',95.00),
  ('renovation','Rockhampton',95.00),('renovation','Bundaberg',95.00),('renovation','Mackay',95.00),
  ('renovation','Hervey Bay',95.00),
  ('renovation','Sydney',95.00),('renovation','Newcastle',95.00),('renovation','Wollongong',95.00),
  ('renovation','Central Coast',95.00),('renovation','Coffs Harbour',95.00),('renovation','Port Macquarie',95.00),
  ('renovation','Tamworth',95.00),('renovation','Wagga Wagga',95.00),('renovation','Albury',95.00),
  ('renovation','Dubbo',95.00),('renovation','Bathurst',95.00),('renovation','Orange',95.00),
  ('renovation','Melbourne',95.00),('renovation','Geelong',95.00),('renovation','Ballarat',95.00),
  ('renovation','Bendigo',95.00),('renovation','Shepparton',95.00),('renovation','Mildura',95.00),
  ('renovation','Warrnambool',95.00),('renovation','Wodonga',95.00),
  ('renovation','Perth',95.00),('renovation','Mandurah',95.00),('renovation','Bunbury',95.00),
  ('renovation','Geraldton',95.00),('renovation','Kalgoorlie',95.00),
  ('renovation','Adelaide',95.00),('renovation','Mount Gambier',95.00),('renovation','Whyalla',95.00),
  ('renovation','Port Augusta',95.00),
  ('renovation','Canberra',95.00),
  ('renovation','Hobart',95.00),('renovation','Launceston',95.00),('renovation','Devonport',95.00),('renovation','Burnie',95.00),
  ('renovation','Darwin',95.00),('renovation','Alice Springs',95.00)

on conflict do nothing;
