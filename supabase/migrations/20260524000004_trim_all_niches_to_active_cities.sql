-- Remove pricing rows for any city not in the active buy-leads dropdown.
-- Applies to ALL niches. Safe to re-run (deletes 0 rows if already clean).

delete from ppl_pricing
where area is not null
  and area not in (
    'Brisbane', 'Gold Coast', 'Sunshine Coast', 'Toowoomba', 'Townsville', 'Cairns',
    'Sydney', 'Newcastle', 'Wollongong', 'Central Coast',
    'Melbourne', 'Geelong',
    'Perth',
    'Adelaide',
    'Canberra'
  );
