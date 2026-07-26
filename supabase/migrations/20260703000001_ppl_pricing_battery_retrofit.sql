-- Add Battery Retrofit niche pricing — default row + the 15 active cities.
-- Default price: $90/lead. Admin can adjust individual rows in /admin.

insert into ppl_pricing (niche, area, price_per_lead) values
  -- Default (all areas)
  ('battery_retrofit', null, 90.00),

  -- Queensland
  ('battery_retrofit','Brisbane',90.00),
  ('battery_retrofit','Gold Coast',90.00),
  ('battery_retrofit','Sunshine Coast',90.00),
  ('battery_retrofit','Toowoomba',90.00),

  ('battery_retrofit','Cairns',90.00),

  -- New South Wales
  ('battery_retrofit','Sydney',90.00),
  ('battery_retrofit','Newcastle',90.00),
  ('battery_retrofit','Wollongong',90.00),
  ('battery_retrofit','Central Coast',90.00),

  -- Victoria
  ('battery_retrofit','Melbourne',90.00),
  ('battery_retrofit','Geelong',90.00),

  -- Western Australia
  ('battery_retrofit','Perth',90.00),

  -- South Australia
  ('battery_retrofit','Adelaide',90.00),

  -- Australian Capital Territory
  ('battery_retrofit','Canberra',90.00)

on conflict do nothing;
