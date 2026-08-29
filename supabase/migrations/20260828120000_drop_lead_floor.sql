-- ============================================================================
-- Drop the lead floor.
--
-- The floor guarantee (a minimum lead count per 30-day cycle, backed by a
-- refund or free continuation) is no longer part of the offer. The site, the
-- terms, the Stripe product description and the renter welcome email were all
-- changed first; this removes the last place it physically lives.
--
-- Tiers stay exactly as they are: starter / growth / scale remain a plain
-- string enum on assets.tier, now describing service level only. The tier
-- check constraint is deliberately untouched.
--
-- Safe to run: assets, rentals and rental_checkouts were all empty (0 rows)
-- when this was written, so no floor value is being discarded.
--
-- Order matters. area_pricing_overview reads assets.floor_leads, so the view
-- is rebuilt before the column is dropped.
-- ============================================================================

-- ── 1. area_pricing_overview: drop floor_min / floor_max / worst_case_per_lead
-- "Worst case per lead" was fee / floor - the per-lead ceiling the site used to
-- promise. With no floor there is no ceiling to compute.
drop view if exists public.area_pricing_overview;

create view public.area_pricing_overview
with (security_invoker = true) as
select r.id                      as region_id,
       r.name                    as region_name,
       r.slug                    as region_slug,
       a.niche_id,
       a.tier,
       count(*)                  as assets,
       min(a.monthly_price_aud)  as price_min,
       max(a.monthly_price_aud)  as price_max,
       bool_or(a.sold_out)       as any_held
  from regions r
  join assets a on a.region_id = r.id and a.deleted_at is null
 group by r.id, r.name, r.slug, a.niche_id, a.tier;

-- ── 2. set_area_pricing loses p_floor. Signature changes, so drop then create.
drop function if exists public.set_area_pricing(uuid, text, integer, integer, uuid);

create function public.set_area_pricing(
  p_region_id uuid,
  p_tier      text    default null,
  p_price     integer default null,
  p_niche_id  uuid    default null
) returns integer
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare v_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'set_area_pricing: not authorised' using errcode = '42501';
  end if;

  if p_price is null then
    raise exception 'set_area_pricing: nothing to change';
  end if;
  if p_price <= 0 then
    raise exception 'set_area_pricing: price must be above zero';
  end if;

  update public.assets
     set monthly_price_aud = p_price
   where region_id = p_region_id
     and deleted_at is null
     and (p_tier     is null or tier     = p_tier)
     and (p_niche_id is null or niche_id = p_niche_id)
     and monthly_price_aud is distinct from p_price;

  get diagnostics v_count = row_count;
  return v_count;
end $function$;

-- match the grants the old function carried (anon deliberately excluded)
revoke all on function public.set_area_pricing(uuid, text, integer, uuid) from public;
grant execute on function public.set_area_pricing(uuid, text, integer, uuid) to authenticated, service_role;

-- ── 3. activate_rental: stop copying the floor onto the rental row.
-- Both overloads are rewritten in place; signatures are unchanged so nothing
-- calling them needs to know.
create or replace function public.activate_rental(
  p_asset_id uuid, p_business_name text, p_contact_name text, p_email text,
  p_phone text, p_stripe_customer_id text, p_stripe_subscription_id text,
  p_stripe_session_id text
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_asset       assets;
  v_installer   uuid;
  v_rental      uuid;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'email is required';
  end if;

  select * into v_asset from assets where id = p_asset_id and deleted_at is null;
  if not found then
    raise exception 'asset % not found', p_asset_id using errcode = 'no_data_found';
  end if;

  if p_stripe_subscription_id is not null then
    select installer_id, id into v_installer, v_rental
    from rentals
    where stripe_subscription_id = p_stripe_subscription_id and ended_at is null
    limit 1;
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

  update rentals set ended_at = now()
  where asset_id = p_asset_id and ended_at is null;

  update assets set
    status = 'rented',
    rented_by = v_installer,
    rented_until = (current_date + 30),
    stripe_subscription_id = p_stripe_subscription_id
  where id = p_asset_id;

  insert into rentals (asset_id, installer_id, monthly_price_aud,
                       stripe_subscription_id, stripe_session_id)
  values (p_asset_id, v_installer, v_asset.monthly_price_aud,
          p_stripe_subscription_id, p_stripe_session_id)
  returning id into v_rental;

  return jsonb_build_object('installer_id', v_installer, 'rental_id', v_rental, 'reused', false);
end;
$function$;

create or replace function public.activate_rental(
  p_asset_id uuid, p_business_name text, p_contact_name text, p_email text,
  p_phone text, p_stripe_customer_id text, p_stripe_subscription_id text,
  p_stripe_session_id text, p_is_trial boolean default false
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_asset       assets;
  v_installer   uuid;
  v_rental      uuid;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'email is required';
  end if;

  select * into v_asset from assets where id = p_asset_id and deleted_at is null;
  if not found then
    raise exception 'asset % not found', p_asset_id using errcode = 'no_data_found';
  end if;

  if p_stripe_subscription_id is not null then
    select installer_id, id into v_installer, v_rental
    from rentals
    where stripe_subscription_id = p_stripe_subscription_id and ended_at is null
    limit 1;
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

  update rentals set ended_at = now()
  where asset_id = p_asset_id and ended_at is null;

  update assets set
    status = 'rented',
    rented_by = v_installer,
    rented_until = (current_date + 30),
    stripe_subscription_id = p_stripe_subscription_id
  where id = p_asset_id;

  insert into rentals (asset_id, installer_id, monthly_price_aud,
                       stripe_subscription_id, stripe_session_id, is_trial)
  values (p_asset_id, v_installer, v_asset.monthly_price_aud,
          p_stripe_subscription_id, p_stripe_session_id, p_is_trial)
  returning id into v_rental;

  return jsonb_build_object('installer_id', v_installer, 'rental_id', v_rental, 'reused', false);
end;
$function$;

-- ── 4. finally, the columns themselves
alter table public.assets            drop column if exists floor_leads;
alter table public.rentals           drop column if exists floor_leads;
alter table public.rental_checkouts  drop column if exists floor_leads;

-- ── 5. grants
-- The recreated set_area_pricing inherits EXECUTE for anon from this database's
-- default privileges. The 5-arg version it replaces did not have it, so revoke
-- it back off. The function is gated on is_super_admin() internally, but an
-- admin pricing RPC should not be callable by an anonymous role at all.
revoke execute on function public.set_area_pricing(uuid, text, integer, uuid) from anon;
