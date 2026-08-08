-- ============================================================================
-- Re-lock insert_lead().
--
-- 20260719120100 revoked this function from public and granted it only to the
-- roles that needed it. 20260724000001 (the leads -> asset_leads rename) then
-- did `drop function ... ; create function ...` — and in Postgres, dropping a
-- function discards its grants while creating one hands EXECUTE back out by
-- default. The lockdown was silently undone.
--
-- That matters because insert_lead() carries NO anti-spam of its own by design:
-- every check (honeypot, time-to-complete, disposable email, visitor cooldown,
-- Veriphone, postcode gate, consent gate) lives upstream in submit-lead, which
-- calls this as the last step. Reachable by anon, the function is a complete
-- bypass of all of it — and everything needed to call it is public: the anon key
-- ships in the funnel page source, and postcode-lookup returns asset_id.
--
-- Two layers go back, so a future drop/create can't quietly reopen it:
--
--   1. GRANTS — anon loses EXECUTE outright. service_role (submit-lead) is
--      granted explicitly rather than relying on a default, so the real capture
--      path is guaranteed to keep working.
--   2. AN IN-FUNCTION GUARD — `authenticated` keeps EXECUTE because Mission
--      Control's test-lead tool calls this straight from the browser as a
--      logged-in admin. The client dashboard shares this Supabase project, so
--      its tenants are `authenticated` here too; the guard is what separates
--      them from LGR admins.
--
-- The guard deliberately keys off auth.uid() being NULL, which is exactly the
-- shape of a service-role call. It introspects no JWT claims and depends on no
-- key format, so it cannot fail closed on submit-lead and drop a real lead.
-- anon is held out by the grant layer, not this check.
--
-- Note for future edits: use `create or replace` (as below) rather than
-- drop/create. Replace preserves grants; drop/create is what caused this.
-- ============================================================================

create or replace function public.insert_lead(
  p_asset_id uuid,
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_postcode text default null,
  p_extra jsonb default '{}'::jsonb
)
returns asset_leads
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_asset     assets;
  v_installer uuid;
  v_is_dup    boolean;
  v_lead      asset_leads;
begin
  -- Authorisation. auth.uid() is NULL for a service-role call (submit-lead),
  -- which is the only path that should be creating leads from the funnels; it
  -- has already run every anti-spam and routing check before reaching here.
  -- A request carrying a real end-user JWT is a human in a browser, and the
  -- only legitimate one of those is an LGR admin using the test-lead tool.
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'insert_lead: not authorised' using errcode = '42501';
  end if;

  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'full_name is required';
  end if;
  if p_phone is null or btrim(p_phone) = '' then
    raise exception 'phone is required';
  end if;

  select * into v_asset from assets where id = p_asset_id;
  if not found then
    raise exception 'asset % not found', p_asset_id using errcode = 'no_data_found';
  end if;

  -- a lead belongs to whoever currently rents the asset
  v_installer := v_asset.rented_by;
  if v_installer is null then
    raise exception 'asset % is not currently rented; no installer to deliver to', p_asset_id;
  end if;

  -- per (asset_id, installer_id, phone) dedup within the last 30 days
  select exists (
    select 1
    from asset_leads l
    where l.asset_id = p_asset_id
      and l.installer_id = v_installer
      and l.phone = p_phone
      and l.status <> 'invalid'
      and l.captured_at > now() - interval '30 days'
  ) into v_is_dup;

  insert into asset_leads (
    asset_id, installer_id, full_name, email, phone, postcode, extra,
    status, is_duplicate
  ) values (
    p_asset_id, v_installer, p_full_name, p_email, p_phone, p_postcode,
    coalesce(p_extra, '{}'::jsonb),
    case when v_is_dup then 'duplicate' else 'delivered' end,
    v_is_dup
  )
  returning * into v_lead;

  if not v_is_dup then
    perform pg_notify(
      'lead_delivered',
      json_build_object(
        'lead_id',      v_lead.id,
        'asset_id',     v_lead.asset_id,
        'installer_id', v_lead.installer_id
      )::text
    );
  end if;

  return v_lead;
end;
$function$;

-- Layer 1: grants. Strip the default-granted EXECUTE, then hand it back only to
-- the two roles that call this — service_role explicitly, so submit-lead never
-- depends on an implicit default again.
revoke all on function public.insert_lead(uuid, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.insert_lead(uuid, text, text, text, text, jsonb)
  to service_role, authenticated;

notify pgrst, 'reload schema';
