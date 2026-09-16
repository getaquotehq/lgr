-- ============================================================================
-- The managed engine model. This is the commercial overhaul, in the schema.
--
-- WHAT CHANGED, IN ONE PARAGRAPH
--
-- LGR used to rent slots on shared engines for a flat monthly price that
-- included the advertising, and guaranteed a LEAD FLOOR (10/20/30 per cycle)
-- remedied by running the engine on unbilled until the floor was met. From now
-- on: one client per engine, the monthly price is a SERVICE FEE that contains
-- no media at all, the client is given access to the LGR-owned Meta ad account
-- and puts THEIR OWN CARD on it so Meta bills them directly, and the guarantee
-- is QUOTES AND QUOTED PIPELINE - 10 quotes and $100,000 per 30-day cycle -
-- remedied by refunding the fee in full.
--
-- See MODEL.md. That document is the source of truth; this migration is it
-- expressed in tables.
--
-- WHY THE FLOOR COLUMNS ARE DROPPED RATHER THAN LEFT ALONE
--
-- floor_leads has already been dropped once (20260828120000) and restored once
-- (20260831170000). Leaving it in place a third time, unused, is how a promise
-- nobody intends to make finds its way back onto a page: the column exists, a
-- view carries it, a card renders it. Two live guarantee numbers is worse than
-- none, because the wrong one gets honoured. So it goes, along with
-- worst_case_per_lead and set_area_pricing's p_floor argument.
--
-- The typical ranges go from the PUBLIC view for the same reason - "typically
-- 10-14 leads" sitting next to "10 quotes guaranteed" invites the reader to
-- average them into a promise we did not make. The columns stay on `assets`
-- because Mission Control still wants them for forecasting; they are simply not
-- anon-readable any more.
--
-- WHY REGION LEAVES THE PUBLIC VIEW
--
-- Exclusivity is per ENGINE, never per area (MODEL.md section 1.1). Regions are
-- plumbing: a funnel brand needs a page per area and leads have to route
-- somewhere. Publishing them made the catalogue look like a territory map, and
-- a prospect reading it concluded they were buying a postcode. They were not.
-- The client states the area they service and we allocate an engine covering
-- it; they never pick from a list.
--
-- WHY TIER IS REMAPPED RATHER THAN RENAMED IN PLACE
--
-- starter/growth/scale were not service levels. They were the three funnel
-- brands wearing price tags - AU Solar Quotes was "starter" at $1,100, Clear
-- Solar Quotes was "growth" at $2,200, Premium Solar Quotes was "scale" at
-- $3,300 - so which brand a client sat on determined what they paid, for an
-- identical product. There are two tiers now and brand has nothing to do with
-- it. Every existing engine becomes `engine` at $1,250; `custom` is scoped and
-- quoted by hand, never self-serve, so nothing is seeded into it.
--
-- NOT DESTRUCTIVE TO LIVE MONEY: rentals keep their own snapshotted
-- monthly_price_aud, so an engagement priced at $2,200 stays at $2,200 until
-- somebody changes it deliberately. Repricing the catalogue never reprices a
-- client.
-- ============================================================================

-- ─── 1. The fee, the budget and the guarantee, on the engine ────────────────
alter table public.assets
  add column if not exists min_daily_budget_aud   numeric(10,2),
  add column if not exists guarantee_quotes       int,
  add column if not exists guarantee_pipeline_aud int,
  add column if not exists guarantee_window_days  int not null default 30;

comment on column public.assets.monthly_price_aud is
  'LGR''s SERVICE FEE, ex GST, per 30-day cycle. Contains NO advertising spend - '
  'the client pays Meta directly from their own card on the ad account we grant '
  'them access to. Never label this "total", "all-in" or "ad spend included". '
  'MODEL.md section 2.';
comment on column public.assets.min_daily_budget_aud is
  'Minimum daily budget the client commits to fund on their own card, charged by '
  'Meta directly. $50/day on the engine tier. LGR never handles, invoices or '
  'marks up this money. Always published beside monthly_price_aud, never instead of it.';
comment on column public.assets.guarantee_quotes is
  'Quotes guaranteed per cycle. A quote is a priced quote sent through the dashboard '
  'against a lead THIS ENGINE delivered. Miss it and the cycle fee is refunded in full.';
comment on column public.assets.guarantee_pipeline_aud is
  'Quoted pipeline guaranteed per cycle, in whole AUD - the sum of those quotes'' totals. '
  'Both this and guarantee_quotes must be met; either one short is a shortfall.';
comment on column public.assets.guarantee_window_days is
  'Length of a guarantee cycle, counted from the day the ads go live - never from the '
  'day the card was charged. Onboarding time is ours to lose, not the client''s.';

-- ─── 2. Two tiers ───────────────────────────────────────────────────────────
-- Constraint is dropped before the data moves, because the existing check only
-- admits starter/growth/scale and the update below writes neither.
alter table public.assets drop constraint if exists assets_tier_check;

update public.assets
   set tier                   = 'engine',
       monthly_price_aud      = 1250,
       min_daily_budget_aud   = 50,
       guarantee_quotes       = 10,
       guarantee_pipeline_aud = 100000,
       guarantee_window_days  = 30
 where deleted_at is null
   and tier in ('starter','growth','scale');

-- Anything soft-deleted is remapped too, so the constraint can be trusted
-- rather than carrying a "…or whatever the old rows said" escape hatch.
update public.assets set tier = 'engine'
 where tier in ('starter','growth','scale');

alter table public.assets
  add constraint assets_tier_check check (tier in ('engine','custom'));

comment on column public.assets.tier is
  'engine = the standard self-serve product ($1,250/mo + $50/day to Meta, 10 quotes / '
  '$100k guaranteed). custom = a scoped engagement, quoted by hand, never self-serve. '
  'Tier is the SERVICE LEVEL and has nothing to do with which funnel brand the engine is.';

-- ─── 3. The engagement: what was agreed, and the ad account handover ────────
-- Snapshotted onto the rental at checkout for the same reason the price always
-- was: repricing an engine must never silently reprice a live client, and a
-- guarantee has to be settleable against the numbers that were actually sold.
alter table public.rentals
  add column if not exists min_daily_budget_aud      numeric(10,2),
  add column if not exists agreed_daily_budget_aud   numeric(10,2),
  add column if not exists guarantee_quotes          int,
  add column if not exists guarantee_pipeline_aud    int,
  add column if not exists guarantee_window_days     int,
  -- The handover. This is the step the whole model turns on, so each part of it
  -- is its own timestamp: "we granted access" and "their card is on it" fail
  -- separately and a client stuck between the two is the most common way an
  -- engagement stalls.
  add column if not exists meta_ad_account_id        text,
  add column if not exists access_granted_at         timestamptz,
  add column if not exists payment_method_added_at   timestamptz,
  add column if not exists ads_live_at               timestamptz,
  add column if not exists ads_paused_at             timestamptz;

comment on column public.rentals.monthly_price_aud is
  'Fee snapshot, ex GST. Service fee only - no media. See assets.monthly_price_aud.';
comment on column public.rentals.agreed_daily_budget_aud is
  'What this client agreed to fund on their card. Defaults to the engine minimum at '
  'checkout; a client spending more than the minimum is agreeing to a bigger number, '
  'not buying a bigger guarantee.';
comment on column public.rentals.meta_ad_account_id is
  'The LGR-owned Meta ad account this client was given access to. LGR owns it before, '
  'during and after the engagement - the client owns the payment method on it and nothing else.';
comment on column public.rentals.payment_method_added_at is
  'When the client''s own card became the ad account''s payment method. Until this is set, '
  'nothing can go live: there is no one to bill for the media.';
comment on column public.rentals.ads_live_at is
  'When delivery actually started. THIS is the guarantee clock - guarantee_cycles.starts_at '
  'is derived from it, never from the Stripe charge date.';

update public.rentals r
   set min_daily_budget_aud   = coalesce(r.min_daily_budget_aud,   a.min_daily_budget_aud),
       agreed_daily_budget_aud= coalesce(r.agreed_daily_budget_aud, a.min_daily_budget_aud),
       guarantee_quotes       = coalesce(r.guarantee_quotes,       a.guarantee_quotes),
       guarantee_pipeline_aud = coalesce(r.guarantee_pipeline_aud, a.guarantee_pipeline_aud),
       guarantee_window_days  = coalesce(r.guarantee_window_days,  a.guarantee_window_days)
  from public.assets a
 where a.id = r.asset_id;

-- Same three fields on the pre-payment checkout row, so Mission Control can see
-- what somebody was quoted even if they never complete.
alter table public.rental_checkouts
  add column if not exists min_daily_budget_aud   numeric(10,2),
  add column if not exists guarantee_quotes       int,
  add column if not exists guarantee_pipeline_aud int;

-- ─── 4. The lead floor is retired ───────────────────────────────────────────
-- Dropped from the views and functions FIRST - a dependent view would block the
-- column drop otherwise - then from the tables. See the header for why it is
-- not simply left unused.
drop view if exists public.area_pricing_overview;
create view public.area_pricing_overview
with (security_invoker = true) as
select r.id as region_id, r.name as region_name, r.slug as region_slug,
       a.niche_id, a.tier,
       count(*)                       as assets,
       min(a.monthly_price_aud)       as fee_min,
       max(a.monthly_price_aud)       as fee_max,
       min(a.min_daily_budget_aud)    as daily_budget_min,
       max(a.min_daily_budget_aud)    as daily_budget_max,
       min(a.guarantee_quotes)        as guarantee_quotes_min,
       max(a.guarantee_quotes)        as guarantee_quotes_max,
       bool_or(a.sold_out)            as any_held
  from public.regions r
  join public.assets a on a.region_id = r.id and a.deleted_at is null
 group by r.id, r.name, r.slug, a.niche_id, a.tier;

comment on view public.area_pricing_overview is
  'Internal pricing overview for Mission Control. Fee and committed daily budget are '
  'separate columns on purpose - there is no combined "cost" number here, because there '
  'is no combined cost: LGR bills the fee and Meta bills the budget.';

-- set_area_pricing loses p_floor and gains the budget and the guarantee. The
-- signature changes, so drop then create - and note the trap 2b169ef hit the
-- last time this function was recreated: a fresh function inherits EXECUTE for
-- anon from the database default privileges, so it is revoked explicitly below
-- even though the body is already gated on is_super_admin().
drop function if exists public.set_area_pricing(uuid, text, integer, integer, uuid);
drop function if exists public.set_area_pricing(uuid, text, integer, uuid);
create function public.set_area_pricing(
  p_region_id            uuid,
  p_tier                 text    default null,
  p_fee                  integer default null,
  p_daily_budget         numeric default null,
  p_guarantee_quotes     integer default null,
  p_guarantee_pipeline   integer default null,
  p_niche_id             uuid    default null
) returns integer language plpgsql security definer set search_path to 'public'
as $$
declare v_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'set_area_pricing: not authorised' using errcode = '42501';
  end if;
  if p_fee is null and p_daily_budget is null
     and p_guarantee_quotes is null and p_guarantee_pipeline is null then
    raise exception 'set_area_pricing: nothing to change';
  end if;
  update public.assets
     set monthly_price_aud      = coalesce(p_fee,                monthly_price_aud),
         min_daily_budget_aud   = coalesce(p_daily_budget,       min_daily_budget_aud),
         guarantee_quotes       = coalesce(p_guarantee_quotes,   guarantee_quotes),
         guarantee_pipeline_aud = coalesce(p_guarantee_pipeline, guarantee_pipeline_aud)
   where region_id = p_region_id
     and deleted_at is null
     and (p_tier is null or tier = p_tier)
     and (p_niche_id is null or niche_id = p_niche_id)
     and (monthly_price_aud      is distinct from coalesce(p_fee,                monthly_price_aud)
       or min_daily_budget_aud   is distinct from coalesce(p_daily_budget,       min_daily_budget_aud)
       or guarantee_quotes       is distinct from coalesce(p_guarantee_quotes,   guarantee_quotes)
       or guarantee_pipeline_aud is distinct from coalesce(p_guarantee_pipeline, guarantee_pipeline_aud));
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.set_area_pricing(uuid, text, integer, numeric, integer, integer, uuid)
  from public, anon;
grant execute on function public.set_area_pricing(uuid, text, integer, numeric, integer, integer, uuid)
  to authenticated, service_role;

alter table public.assets           drop column if exists floor_leads;
alter table public.rentals          drop column if exists floor_leads;
alter table public.rental_checkouts drop column if exists floor_leads;

-- ─── 5. The public catalogue ────────────────────────────────────────────────
-- Still an include-list, not "select * except": a column added to `assets`
-- tomorrow is private until somebody writes it into this list on purpose, which
-- is the safe direction for the default to fall. See MODEL.md section 7.
--
-- Gone from it: brand_name and brand_domain (never were here - engine identity
-- is paid-only), floor_leads (retired), typical_min/typical_max (a lead range
-- beside a quote guarantee reads as a second promise), and every region column
-- (exclusivity is per engine, not per area).
--
-- What is left is exactly the catalogue a prospect needs: trade, tier, fee,
-- the budget they will owe Meta, the guarantee, and whether anything is free.
--
-- security_invoker stays OFF so the view runs as its owner - anon has no SELECT
-- policy on `assets`, so flipping it would make this return nothing and blank
-- the pricing page. Supabase's linter raises `security_definer_view` on that
-- and it is expected here rather than a defect: the projection IS the security
-- boundary. Do not "fix" the advisor.
drop view if exists public.assets_public;
create view public.assets_public as
  select a.id,
         a.tier,
         a.monthly_price_aud,
         a.min_daily_budget_aud,
         a.guarantee_quotes,
         a.guarantee_pipeline_aud,
         a.guarantee_window_days,
         a.status,
         a.sold_out,
         a.created_at,
         a.niche_id,
         n.slug as niche_slug,
         n.name as niche_name
    from public.assets a
    join public.niches n on n.id = a.niche_id
   where a.deleted_at is null;

comment on view public.assets_public is
  'Public engine catalogue: trade, tier, fee, committed daily budget, guarantee and '
  'availability. Never brand_name or brand_domain (engine identity is revealed after '
  'payment), and never region - exclusivity is per engine, and publishing areas made '
  'the catalogue read as a territory map we do not sell. MODEL.md sections 1.1 and 7.';

revoke all on public.assets_public from anon, authenticated;
grant select on public.assets_public to anon, authenticated;

-- ─── 6. Availability, without disclosing the map ────────────────────────────
-- The pricing page needs one number - "is there an engine free in this trade" -
-- and the checkout needs to resolve a service area to an actual engine. Neither
-- may hand anon a region-by-region availability grid: that is the territory map
-- again, arrived at by counting.
--
-- So availability is published per TRADE only, and the postcode resolution
-- happens server-side inside create-rental-checkout under the service role.
drop view if exists public.engine_availability;
create view public.engine_availability as
  select n.slug              as niche_slug,
         n.name              as niche_name,
         n.status            as niche_status,
         count(a.id) filter (
           where a.status = 'available' and not a.sold_out and a.deleted_at is null
         )                   as engines_available,
         min(a.monthly_price_aud)    filter (where a.deleted_at is null) as fee_aud,
         min(a.min_daily_budget_aud) filter (where a.deleted_at is null) as daily_budget_aud,
         min(a.guarantee_quotes)     filter (where a.deleted_at is null) as guarantee_quotes,
         min(a.guarantee_pipeline_aud) filter (where a.deleted_at is null) as guarantee_pipeline_aud
    from public.niches n
    left join public.assets a
           on a.niche_id = n.id and a.tier = 'engine'
   group by n.slug, n.name, n.status, n.sort_order
   order by n.sort_order, n.name;

comment on view public.engine_availability is
  'Per-trade availability for the public pricing page. A count, never a list - a '
  'region-by-region breakdown is the territory map by another route. MODEL.md section 1.1.';

revoke all on public.engine_availability from anon, authenticated;
grant select on public.engine_availability to anon, authenticated;

-- ─── 7. activate_rental ─────────────────────────────────────────────────────
-- Snapshots the fee, the committed budget and the guarantee onto the rental,
-- and no longer copies a lead floor because there is not one.
--
-- It deliberately does NOT stamp ads_live_at. Payment is not delivery: the ad
-- account still has to be handed over and the client's card still has to go on
-- it. Starting the guarantee clock here would charge a client for the days we
-- spent onboarding them, which is the opposite of MODEL.md section 3.2.
create or replace function public.activate_rental(
  p_asset_id uuid, p_business_name text, p_contact_name text, p_email text,
  p_phone text, p_stripe_customer_id text, p_stripe_subscription_id text,
  p_stripe_session_id text, p_is_trial boolean default false
) returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_asset assets; v_installer uuid; v_rental uuid;
begin
  if p_email is null or btrim(p_email) = '' then raise exception 'email is required'; end if;

  select * into v_asset from assets where id = p_asset_id and deleted_at is null;
  if not found then
    raise exception 'asset % not found', p_asset_id using errcode = 'no_data_found';
  end if;

  -- Idempotency: Stripe retries webhooks, and a retry must not create a second
  -- engagement or a second guarantee cycle.
  if p_stripe_subscription_id is not null then
    select installer_id, id into v_installer, v_rental from rentals
     where stripe_subscription_id = p_stripe_subscription_id and ended_at is null limit 1;
    if found then
      return jsonb_build_object('installer_id', v_installer, 'rental_id', v_rental, 'reused', true);
    end if;
  end if;

  insert into installers (business_name, contact_name, email, phone, stripe_customer_id)
  values (coalesce(nullif(btrim(p_business_name), ''), 'Installer'),
          p_contact_name, lower(btrim(p_email)), p_phone, p_stripe_customer_id)
  on conflict (email) do update
    set business_name      = coalesce(nullif(btrim(excluded.business_name), ''), installers.business_name),
        contact_name       = coalesce(excluded.contact_name, installers.contact_name),
        phone              = coalesce(excluded.phone, installers.phone),
        stripe_customer_id = coalesce(excluded.stripe_customer_id, installers.stripe_customer_id)
  returning id into v_installer;

  -- One client per engine (MODEL.md section 1.1). Any open engagement on this
  -- engine ends here; in practice there is none, because the engine had to read
  -- `available` to be sold.
  update rentals set ended_at = now() where asset_id = p_asset_id and ended_at is null;

  update assets
     set status                 = 'rented',
         rented_by              = v_installer,
         rented_until           = (current_date + coalesce(v_asset.guarantee_window_days, 30)),
         stripe_subscription_id = p_stripe_subscription_id
   where id = p_asset_id;

  insert into rentals (
      asset_id, installer_id, monthly_price_aud,
      min_daily_budget_aud, agreed_daily_budget_aud,
      guarantee_quotes, guarantee_pipeline_aud, guarantee_window_days,
      stripe_subscription_id, stripe_session_id, is_trial)
  values (
      p_asset_id, v_installer, v_asset.monthly_price_aud,
      v_asset.min_daily_budget_aud, v_asset.min_daily_budget_aud,
      v_asset.guarantee_quotes, v_asset.guarantee_pipeline_aud,
      coalesce(v_asset.guarantee_window_days, 30),
      p_stripe_subscription_id, p_stripe_session_id, p_is_trial)
  returning id into v_rental;

  return jsonb_build_object('installer_id', v_installer, 'rental_id', v_rental, 'reused', false);
end $$;

revoke all on function public.activate_rental(uuid, text, text, text, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.activate_rental(uuid, text, text, text, text, text, text, text, boolean)
  to service_role;

-- ─── 8. Resolve a service area to an engine ─────────────────────────────────
-- Checkout takes a postcode - "where do you want the work" - and has to turn it
-- into an actual engine. The client never sees regions, so this runs
-- server-side under the service role and returns one id or nothing.
--
-- Which engine, when several cover the same postcode: the least recently
-- created one that is free. Not random, because a deterministic order makes a
-- double-submitted checkout resolve to the same engine twice and collide on the
-- `available` check rather than quietly consuming two.
create or replace function public.allocate_engine(
  p_niche_slug text,
  p_postcode   text,
  p_tier       text default 'engine'
) returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_asset uuid;
begin
  select a.id into v_asset
    from public.assets a
    join public.niches  n on n.id = a.niche_id
    join public.regions r on r.id = a.region_id
   where n.slug = p_niche_slug
     and a.tier = p_tier
     and a.status = 'available'
     and not a.sold_out
     and a.deleted_at is null
     -- Same effective-patch rule the delivery gate uses (20260719160000):
     -- assets.service_postcodes overrides the region's default when set.
     -- Allocating on a different patch from the one that routes leads would
     -- put a client on an engine that can never deliver to them.
     and btrim(p_postcode) = any (
           case when a.service_postcodes is not null and cardinality(a.service_postcodes) > 0
                then a.service_postcodes else r.postcodes end)
   order by a.created_at, a.id
   limit 1;
  return v_asset;  -- null means "nothing free covering that area"
end $$;

revoke all on function public.allocate_engine(text, text, text) from public, anon, authenticated;
grant execute on function public.allocate_engine(text, text, text) to service_role;

comment on function public.allocate_engine(text, text, text) is
  'Service role only. Turns a postcode into an available engine id for checkout. Never '
  'exposed to anon: a caller who can probe it postcode by postcode has rebuilt the '
  'territory map the catalogue deliberately withholds.';

notify pgrst, 'reload schema';
