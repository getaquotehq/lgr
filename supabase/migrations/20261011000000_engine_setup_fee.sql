-- ============================================================================
-- Engine plan pricing: a one-off setup fee plus a lower monthly fee.
--
-- The Engine plan is a setup fee from $1,250 + GST, charged once with the
-- first month, then from $690 + GST a month. Until now the site, the database
-- and the checkout all treated $1,250 as the MONTHLY fee, which overstated the
-- recurring cost and never charged a setup fee at all.
--
-- monthly_price_aud keeps meaning "our recurring fee"; setup_fee_aud is new
-- and is charged once by create-rental-checkout as a one-off line item on the
-- first invoice of the subscription.
--
-- Live rentals are deliberately untouched: their fee was snapshotted at
-- checkout and their Stripe subscription carries its own price. Repricing an
-- engine must never silently reprice a live client.
-- ============================================================================

-- Defaults to the Engine plan's setup fee so engines added by hand in Mission
-- Control charge it too; Custom engagements are agreed in writing, so zero.
alter table public.assets
  add column if not exists setup_fee_aud int not null default 1250;

update public.assets set setup_fee_aud = 0 where tier = 'custom';

comment on column public.assets.setup_fee_aud is
  'One-off setup fee in AUD ex GST, charged once with the first month at checkout. '
  'Like monthly_price_aud it is OUR fee and contains no advertising spend.';

update public.assets
   set monthly_price_aud = 690,
       setup_fee_aud     = 1250
 where tier = 'engine'
   and monthly_price_aud = 1250;

comment on column public.assets.tier is
  'engine = the standard self-serve product (setup from $1,250 then from $690/mo, both + GST, '
  'plus $50/day to Meta, 10 quotes guaranteed). custom = a scoped engagement, quoted by hand, '
  'never self-serve. Tier is the SERVICE LEVEL and has nothing to do with which funnel brand '
  'the engine is.';

-- Rentals snapshot what was agreed at checkout, so the setup fee goes there too.
alter table public.rental_checkouts
  add column if not exists setup_fee_aud int;

-- Same view as 20260917000000 with setup_fee_aud appended, so the public pages
-- can show the setup fee from the same source as the monthly fee.
create or replace view public.engine_availability as
  select n.slug              as niche_slug,
         n.name              as niche_name,
         n.status            as niche_status,
         count(a.id) filter (
           where a.status = 'available' and not a.sold_out and a.deleted_at is null
         )                   as engines_available,
         min(a.monthly_price_aud)    filter (where a.deleted_at is null) as fee_aud,
         min(a.min_daily_budget_aud) filter (where a.deleted_at is null) as daily_budget_aud,
         min(a.guarantee_quotes)     filter (where a.deleted_at is null) as guarantee_quotes,
         min(a.setup_fee_aud)        filter (where a.deleted_at is null) as setup_fee_aud
    from public.niches n
    left join public.assets a
           on a.niche_id = n.id and a.tier = 'engine'
   group by n.slug, n.name, n.status, n.sort_order
   order by n.sort_order, n.name;

notify pgrst, 'reload schema';
