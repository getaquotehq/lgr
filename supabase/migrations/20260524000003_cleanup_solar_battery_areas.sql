-- Remove solar_battery pricing rows for cities not in the buy-leads city dropdown.
-- Keeps only the 18 cities shown to users + the default (null area) row.

delete from ppl_pricing
where niche = 'solar_battery'
  and area is not null
  and area not in (
    'Brisbane', 'Gold Coast', 'Sunshine Coast', 'Toowoomba', 'Townsville', 'Cairns',
    'Sydney', 'Newcastle', 'Wollongong', 'Central Coast',
    'Melbourne', 'Geelong',
    'Perth',
    'Adelaide',
    'Canberra',
    'Hobart', 'Launceston',
    'Darwin'
  );
