-- Add Solar Battery niche pricing — default row + the 15 active cities.
-- Default price: $90/lead. Admin can adjust individual rows in /admin.

insert into ppl_pricing (niche, area, price_per_lead) values
  -- Default (all areas)
  ('solar_battery', null, 90.00),

  -- Queensland
  ('solar_battery','Brisbane',90.00),
  ('solar_battery','Gold Coast',90.00),
  ('solar_battery','Sunshine Coast',90.00),
  ('solar_battery','Toowoomba',90.00),
  ('solar_battery','Townsville',90.00),
  ('solar_battery','Cairns',90.00),

  -- New South Wales
  ('solar_battery','Sydney',90.00),
  ('solar_battery','Newcastle',90.00),
  ('solar_battery','Wollongong',90.00),
  ('solar_battery','Central Coast',90.00),

  -- Victoria
  ('solar_battery','Melbourne',90.00),
  ('solar_battery','Geelong',90.00),

  -- Western Australia
  ('solar_battery','Perth',90.00),

  -- South Australia
  ('solar_battery','Adelaide',90.00),

  -- Australian Capital Territory
  ('solar_battery','Canberra',90.00)

on conflict do nothing;
