-- ============================================================================
-- Stripe auto-checkout for asset rentals
--
-- Public flow: fleet.html "Rent this asset" → create-rental-checkout Edge
-- Function → Stripe Checkout (subscription, monthly) → stripe-webhook Edge
-- Function → activate_rental() → the asset shows as rented in Mission Control,
-- the installer is created/updated, and a rentals history row is opened.
--
-- LGR is billed month-to-month in advance, so a rental is a Stripe
-- *subscription* (recurring monthly price). Cancelling the subscription in
-- Stripe fires customer.subscription.deleted → release_rental() frees the asset.
--
-- Everything here is additive and idempotent (safe to re-run).
-- ============================================================================

-- 1. Stripe linkage columns ---------------------------------------------------
alter table installers add column if not exists stripe_customer_id text;

alter table assets     add column if not exists stripe_subscription_id text;

alter table rentals    add column if not exists stripe_subscription_id text;
alter table rentals    add column if not exists stripe_session_id text;

create index if not exists installers_stripe_customer_idx on installers(stripe_customer_id);
create index if not exists assets_stripe_sub_idx          on assets(stripe_subscription_id);
create index if not exists rentals_stripe_sub_idx         on rentals(stripe_subscription_id);

-- 2. Checkout attempts --------------------------------------------------------
-- One row per Stripe Checkout session we create, captured BEFORE payment so an
-- abandoned checkout is still visible to ops. Flipped to 'paid' by the webhook.
create table if not exists rental_checkouts (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references assets(id) on delete set null,
  business_name text not null,
  contact_name text,
  email text not null,
  phone text,
  monthly_price_aud int,
  floor_leads int,
  stripe_session_id text unique,
  stripe_subscription_id text,
  stripe_customer_id text,
  status text not null default 'pending'
    check (status in ('pending','paid','expired','failed')),
  created_at timestamptz default now(),
  paid_at timestamptz
);
create index if not exists rental_checkouts_asset_idx   on rental_checkouts(asset_id);
create index if not exists rental_checkouts_status_idx  on rental_checkouts(status);
create index if not exists rental_checkouts_created_idx on rental_checkouts(created_at desc);

-- RLS: service role (webhook / checkout fn) bypasses RLS; admins (authenticated
-- lgr-mc operators) get full access; anon never touches it.
alter table rental_checkouts enable row level security;
drop policy if exists "admin all rental_checkouts" on rental_checkouts;
create policy "admin all rental_checkouts" on rental_checkouts
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on rental_checkouts to authenticated;
revoke all on rental_checkouts from anon;

-- ----------------------------------------------------------------------------
-- 3. activate_rental(): called by the Stripe webhook after a successful
--    checkout.session.completed. Idempotent on stripe_subscription_id, so a
--    replayed webhook won't double-rent or open a second rentals row.
--
--    * find-or-create the installer by email (business name / contact / phone /
--      stripe_customer_id are refreshed from the latest checkout)
--    * mark the asset rented to that installer for a fresh 30-day cycle
--    * open a rentals history row carrying the Stripe ids
-- ----------------------------------------------------------------------------
create or replace function activate_rental(
  p_asset_id uuid,
  p_business_name text,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_session_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  -- Idempotency: if this subscription already activated a rental, return it.
  if p_stripe_subscription_id is not null then
    select installer_id, id into v_installer, v_rental
    from rentals
    where stripe_subscription_id = p_stripe_subscription_id and ended_at is null
    limit 1;
    if found then
      return jsonb_build_object('installer_id', v_installer, 'rental_id', v_rental, 'reused', true);
    end if;
  end if;

  -- find-or-create installer by email
  insert into installers (business_name, contact_name, email, phone, stripe_customer_id)
  values (coalesce(nullif(btrim(p_business_name), ''), 'Installer'),
          p_contact_name, lower(btrim(p_email)), p_phone, p_stripe_customer_id)
  on conflict (email) do update
    set business_name      = coalesce(nullif(btrim(excluded.business_name), ''), installers.business_name),
        contact_name       = coalesce(excluded.contact_name, installers.contact_name),
        phone              = coalesce(excluded.phone, installers.phone),
        stripe_customer_id = coalesce(excluded.stripe_customer_id, installers.stripe_customer_id)
  returning id into v_installer;

  -- close any open rental on this asset (a prior renter releasing it)
  update rentals set ended_at = now()
  where asset_id = p_asset_id and ended_at is null;

  -- rent the asset for a fresh 30-day cycle
  update assets set
    status = 'rented',
    rented_by = v_installer,
    rented_until = (current_date + 30),
    stripe_subscription_id = p_stripe_subscription_id
  where id = p_asset_id;

  -- open the rentals history row
  insert into rentals (asset_id, installer_id, monthly_price_aud, floor_leads,
                       stripe_subscription_id, stripe_session_id)
  values (p_asset_id, v_installer, v_asset.monthly_price_aud, v_asset.floor_leads,
          p_stripe_subscription_id, p_stripe_session_id)
  returning id into v_rental;

  return jsonb_build_object('installer_id', v_installer, 'rental_id', v_rental, 'reused', false);
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. release_rental(): called by the webhook on customer.subscription.deleted
--    (the installer cancelled, or payment lapsed). Frees the asset and closes
--    the open rentals row. No-op if the subscription isn't currently renting.
-- ----------------------------------------------------------------------------
create or replace function release_rental(p_stripe_subscription_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset uuid;
begin
  if p_stripe_subscription_id is null then
    return jsonb_build_object('released', false);
  end if;

  select id into v_asset from assets
  where stripe_subscription_id = p_stripe_subscription_id
  limit 1;

  update rentals set ended_at = now()
  where stripe_subscription_id = p_stripe_subscription_id and ended_at is null;

  if v_asset is not null then
    update assets set
      status = 'available',
      rented_by = null,
      rented_until = null,
      stripe_subscription_id = null
    where id = v_asset;
  end if;

  return jsonb_build_object('released', v_asset is not null, 'asset_id', v_asset);
end;
$$;

-- These RPCs are for the service role only (invoked from the webhook). Never
-- expose them to anon/authenticated clients.
revoke all on function activate_rental(uuid, text, text, text, text, text, text, text) from public;
revoke all on function release_rental(text) from public;
