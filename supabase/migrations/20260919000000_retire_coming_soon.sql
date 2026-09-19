-- ============================================================================
-- Retire "coming soon".
--
-- Four of the five niches have sat at status='coming_soon' since the fleet was
-- first seeded, which put a yellow ribbon across the top of their trade page, a
-- greyed-out tile with a dead button on the homepage, and nothing a visitor
-- could act on. It was meant to be temporary. It has been the permanent state
-- of most of the catalogue.
--
-- The label was always a worse answer than the real one. "Coming soon" is a
-- claim about the future that nobody updates; "we have an engine free for your
-- trade" or "we do not right now, tell us where you work" is a fact, it is
-- already computed from live inventory by engine_availability, and it is what
-- the trade pages and the pricing page now show.
--
-- So the status goes. Every niche is live, the enum drops the value, and the
-- honest signal is availability rather than a badge.
--
-- WHAT HAPPENS TO A TRADE WITH NO ENGINES
--
-- Nothing bad, and this is the part that makes it safe to remove the label. A
-- visitor on, say, the roofing page sees the offer and checks availability;
-- engine_availability returns zero engines, the widget says none are free, and
-- if they push on to checkout allocate_engine() returns null and the request is
-- refused with "we do not have an engine free covering that area right now".
-- Nobody can pay for a trade we cannot serve - that was already true, enforced
-- server-side, and it did not need a ribbon to hold it up.
-- ============================================================================

update public.niches set status = 'live' where status = 'coming_soon';

alter table public.niches drop constraint if exists niches_status_check;
alter table public.niches
  add constraint niches_status_check check (status in ('live','paused'));

comment on column public.niches.status is
  'live = shown and sellable. paused = hidden entirely. There is deliberately no '
  '"coming soon": whether a trade can be served is answered from real inventory via '
  'engine_availability and allocate_engine(), not from a label somebody has to remember to change.';

notify pgrst, 'reload schema';
