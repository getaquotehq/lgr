-- ============================================================================
-- Restore the lead floor, reversing 20260828120000.
--
-- Applied to the live database. The decision: exposing the engines publicly was
-- the thing that made the offer feel unsafe, and that is now fixed separately
-- (20260831120000). The floor did not need to go with it.
--
-- Floors are the original numbers - 10 / 20 / 30 - against current pricing of
-- $1,100 / $2,200 / $3,300, so the per-lead ceiling is $110 on every tier.
--
-- THE REMEDY IS SPEND, NOT CASH. A cycle that lands short does not trigger a
-- refund or a credit: the engine keeps running past the cycle, unbilled, until
-- the floor is delivered. That keeps the obligation inside the thing LGR
-- controls (advertising) and leaves the non-refundable terms intact.
--
-- THE RULE THAT PROTECTS THE PRODUCT: a shortfall is filled by spending more,
-- never by widening the service area, loosening the postcode gate or lowering
-- what counts as a lead. See MODEL.md section 4.
--
-- rentals.floor_leads is snapshotted at checkout by activate_rental, so a
-- renter keeps the floor they bought even if the engine is repriced later.
-- ============================================================================

alter table public.assets            add column if not exists floor_leads int;
alter table public.rentals           add column if not exists floor_leads int;
alter table public.rental_checkouts  add column if not exists floor_leads int;

update public.assets set floor_leads = case tier
  when 'starter' then 10 when 'growth' then 20 when 'scale' then 30 end
 where floor_leads is null and deleted_at is null;

comment on column public.assets.floor_leads is
  'Minimum leads guaranteed per 30-day cycle. The engine keeps running past the cycle until the floor is delivered. Filled by spending more, never by accepting weaker leads.';

-- area_pricing_overview regains floor_min / floor_max / worst_case_per_lead.
drop view if exists public.area_pricing_overview;
create view public.area_pricing_overview
with (security_invoker = true) as
select r.id as region_id, r.name as region_name, r.slug as region_slug,
       a.niche_id, a.tier,
       count(*) as assets,
       min(a.monthly_price_aud) as price_min,
       max(a.monthly_price_aud) as price_max,
       min(a.floor_leads) as floor_min,
       max(a.floor_leads) as floor_max,
       max(a.monthly_price_aud)::numeric / nullif(min(a.floor_leads),0) as worst_case_per_lead,
       bool_or(a.sold_out) as any_held
  from regions r
  join assets a on a.region_id = r.id and a.deleted_at is null
 group by r.id, r.name, r.slug, a.niche_id, a.tier;

-- set_area_pricing regains p_floor. Signature changes, so drop then create.
-- Note the trap 2b169ef hit going the other way: recreating this inherits
-- EXECUTE for anon from the database default privileges, so it is revoked
-- explicitly below even though the body is gated on is_super_admin().
drop function if exists public.set_area_pricing(uuid, text, integer, uuid);
create function public.set_area_pricing(
  p_region_id uuid, p_tier text default null, p_price integer default null,
  p_floor integer default null, p_niche_id uuid default null
) returns integer language plpgsql security definer set search_path to 'public'
as $$
declare v_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'set_area_pricing: not authorised' using errcode = '42501';
  end if;
  if p_price is null and p_floor is null then
    raise exception 'set_area_pricing: nothing to change';
  end if;
  update public.assets
     set monthly_price_aud = coalesce(p_price, monthly_price_aud),
         floor_leads       = coalesce(p_floor, floor_leads)
   where region_id = p_region_id
     and deleted_at is null
     and (p_tier is null or tier = p_tier)
     and (p_niche_id is null or niche_id = p_niche_id)
     and (monthly_price_aud is distinct from coalesce(p_price, monthly_price_aud)
       or floor_leads       is distinct from coalesce(p_floor, floor_leads));
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.set_area_pricing(uuid, text, integer, integer, uuid) from public, anon;
grant execute on function public.set_area_pricing(uuid, text, integer, integer, uuid) to authenticated, service_role;

-- activate_rental snapshots the floor onto the rental row again.
create or replace function public.activate_rental(p_asset_id uuid, p_business_name text, p_contact_name text, p_email text, p_phone text, p_stripe_customer_id text, p_stripe_subscription_id text, p_stripe_session_id text, p_is_trial boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_asset assets; v_installer uuid; v_rental uuid;
begin
  if p_email is null or btrim(p_email) = '' then raise exception 'email is required'; end if;
  select * into v_asset from assets where id = p_asset_id and deleted_at is null;
  if not found then raise exception 'asset % not found', p_asset_id using errcode = 'no_data_found'; end if;
  if p_stripe_subscription_id is not null then
    select installer_id, id into v_installer, v_rental from rentals
     where stripe_subscription_id = p_stripe_subscription_id and ended_at is null limit 1;
    if found then return jsonb_build_object('installer_id', v_installer, 'rental_id', v_rental, 'reused', true); end if;
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
  update rentals set ended_at = now() where asset_id = p_asset_id and ended_at is null;
  update assets set status='rented', rented_by=v_installer, rented_until=(current_date + 30),
                    stripe_subscription_id=p_stripe_subscription_id
   where id = p_asset_id;
  insert into rentals (asset_id, installer_id, monthly_price_aud, floor_leads,
                       stripe_subscription_id, stripe_session_id, is_trial)
  values (p_asset_id, v_installer, v_asset.monthly_price_aud, v_asset.floor_leads,
          p_stripe_subscription_id, p_stripe_session_id, p_is_trial)
  returning id into v_rental;
  return jsonb_build_object('installer_id', v_installer, 'rental_id', v_rental, 'reused', false);
end $$;

-- The public catalogue carries the floor so /fleet can show it.
drop view if exists public.assets_public;
create view public.assets_public as
  select a.id, a.tier, a.monthly_price_aud, a.typical_min, a.typical_max, a.floor_leads,
         a.status, a.sold_out, a.created_at,
         a.niche_id, n.slug as niche_slug, n.name as niche_name,
         a.region_id, r.slug as region_slug, r.name as region_name,
         r.state as region_state, r.sort_order as region_sort_order
    from public.assets a
    join public.niches  n on n.id = a.niche_id
    join public.regions r on r.id = a.region_id
   where a.deleted_at is null;
revoke all on public.assets_public from anon, authenticated;
grant select on public.assets_public to anon, authenticated;

notify pgrst, 'reload schema';
