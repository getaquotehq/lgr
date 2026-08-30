-- ============================================================================
-- Battery becomes its own niche.
--
-- Battery retrofit is priced separately from solar (950/1850/2750 against
-- 1100/2200/3300), but it had no niche of its own. solar-battery-leads.html
-- queried niches.slug = 'solar' and linked to the fleet with no niche param,
-- so the fleet fell back to solar. A battery buyer read $950 on the page and
-- would have been shown a solar engine at $1,100 one click later: $950 was a
-- price nobody could actually pay.
--
-- Giving battery its own niche lets battery engines carry the battery price.
-- No assets are seeded here. That is a commercial decision, and until battery
-- engines exist the page correctly shows "coming soon" rather than borrowing
-- solar stock.
-- ============================================================================
insert into niches (slug, name, short_desc, status, sort_order)
values ('battery', 'Solar Battery',
        'Homeowners pricing battery storage and retrofits onto existing solar',
        'live', 2)
on conflict (slug) do nothing;

-- keep the homepage trade picker in the same order as the site nav
update niches set sort_order = 3 where slug = 'hvac';
update niches set sort_order = 4 where slug = 'roofing';
update niches set sort_order = 5 where slug = 'renovations';

-- solar no longer speaks for battery
update niches
   set short_desc = 'Homeowners actively pricing a residential solar install'
 where slug = 'solar';
