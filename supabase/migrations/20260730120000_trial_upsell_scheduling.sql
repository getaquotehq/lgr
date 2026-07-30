-- Trial-to-paid upsell scheduling. Since the 5-lead trial no longer
-- auto-rolls into a subscription, this is the only thing that turns a
-- trial into recurring revenue - it has to be a real scheduled job, not
-- something a human remembers to do per customer.

alter table public.rentals
  add column if not exists is_trial boolean not null default false,
  add column if not exists trial_upsell_sent_at timestamptz;

create index if not exists rentals_trial_upsell_idx
  on public.rentals (started_at)
  where is_trial = true and ended_at is null and trial_upsell_sent_at is null;

-- activate_rental gains p_is_trial (default false, so every existing caller
-- keeps working unchanged) and stamps it onto the new rentals row.
create or replace function public.activate_rental(
  p_asset_id uuid,
  p_business_name text,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_session_id text,
  p_is_trial boolean default false
)
returns jsonb
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

  insert into rentals (asset_id, installer_id, monthly_price_aud, floor_leads,
                       stripe_subscription_id, stripe_session_id, is_trial)
  values (p_asset_id, v_installer, v_asset.monthly_price_aud, v_asset.floor_leads,
          p_stripe_subscription_id, p_stripe_session_id, p_is_trial)
  returning id into v_rental;

  return jsonb_build_object('installer_id', v_installer, 'rental_id', v_rental, 'reused', false);
end;
$function$;

-- Daily scheduled check, day 5-9 of the trial, tied to actual lead-delivery
-- progress. The cron job authenticates to the edge function with a shared
-- secret pulled from Vault (never the literal value, so it never lands in
-- git via this migration) - see trial-upsell-check for the receiving side.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'trial-upsell-daily-check',
  '0 22 * * *',
  $cron$
  select net.http_post(
    url := 'https://tgujjtllrrhpwkcmmqap.supabase.co/functions/v1/trial-upsell-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'trial_upsell_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
