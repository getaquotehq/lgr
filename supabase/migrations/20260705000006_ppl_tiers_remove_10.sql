-- Remove the 10-lead pack entirely and standardise on five packs:
-- 25, 50, 100, 200, 300. This replaces the tier set seeded in
-- 20260524000001. Orders snapshot quantity + discount at purchase time and do
-- not reference tier ids, so clearing and re-seeding is safe. The /admin
-- discount editor reads this table live, so it reflects the new set with no
-- code change.

delete from public.volume_discount_tiers;

insert into public.volume_discount_tiers
  (min_quantity, discount_percent, label, is_popular, active, sort_order)
values
  (25,  0,  '25 leads',  false, true, 1),
  (50,  5,  '50 leads',  true,  true, 2),
  (100, 5,  '100 leads', false, true, 3),
  (200, 10, '200 leads', false, true, 4),
  (300, 15, '300 leads', false, true, 5);
