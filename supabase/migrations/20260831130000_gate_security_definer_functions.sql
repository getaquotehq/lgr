-- ============================================================================
-- Close the SECURITY DEFINER functions that any logged-in account could call.
--
-- 8db511f closed these to `anon`. It did not close them to `authenticated`, and
-- dashboard signup is open, so "authenticated" means "anyone who filled in the
-- signup form". A SECURITY DEFINER function bypasses RLS, so an EXECUTE grant
-- to `authenticated` on an ungated one is a full bypass of every policy the
-- rest of this schema relies on. The worst of them:
--
--   activate_rental(...)   - creates an installer, a rental and marks the asset
--                            rented. No auth check, no Stripe verification. Any
--                            account could grant itself a slot for free.
--   release_rental(...)    - ends any rental by subscription id.
--   hard_delete_asset(id)  - permanently deletes an asset AND its leads,
--                            rentals and checkout records. Irreversible.
--   add_sms_credits(...)   - credits any company's SMS balance.
--   decrypt_api_key(...)   - decrypts any company's stored API key.
--
-- Three different fixes, chosen per function by who is supposed to call it:
--
--   1. Called by Mission Control / the dashboard as a logged-in super admin
--      -> keep the grant, add an is_super_admin() gate inside the function.
--      This is the pattern set_area_pricing and set_area_sold_out already use.
--   2. Called only by an edge function on the service role
--      -> revoke EXECUTE from anon and authenticated. service_role is not a
--         member of either and bypasses the grant, so the webhooks keep working.
--   3. Trigger and event-trigger functions
--      -> revoke from both. Postgres checks EXECUTE when a trigger is CREATEd,
--         not when it fires, so revoking cannot break the triggers themselves.
--         They were only ever reachable because PostgREST exposes every
--         function in the schema as an RPC endpoint.
--
-- Verified against the actual callers before writing this: every rpc() call in
-- the site, Mission Control, the dashboard and all 31 edge functions was
-- enumerated, and nothing in group 2 or 3 is called from a browser.
-- ============================================================================

-- ── 1. Gate the admin functions that stay callable from Mission Control ─────
-- Bodies are unchanged apart from the guard; both were previously wide open.

create or replace function public.hard_delete_asset(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'hard_delete_asset: not authorised' using errcode = '42501';
  end if;

  delete from asset_leads      where asset_id = p_id;
  delete from rentals          where asset_id = p_id;
  delete from rental_checkouts where asset_id = p_id;
  delete from assets           where id = p_id;
end $$;

create or replace function public.hard_delete_installer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'hard_delete_installer: not authorised' using errcode = '42501';
  end if;

  update assets set status='available', rented_by=null, rented_until=null,
                    stripe_subscription_id=null
  where rented_by = p_id;
  delete from asset_leads where installer_id = p_id;
  delete from rentals     where installer_id = p_id;
  delete from installers  where id = p_id;
end $$;

-- route_lead takes a company_id and returns one of that company's rep ids, so
-- as it stood any account could walk other companies' rep rotations and, worse,
-- advance their round-robin index. Scope it to the caller's own company.
--
-- The guard is skipped when auth.uid() is null, which is the case for the
-- service role: api/index.ts and twilio-inbound-sms call this server-side for
-- whichever company owns the inbound lead, and must keep working.
create or replace function public.route_lead(p_company_id uuid, p_postcode text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_settings jsonb; v_routing jsonb; v_mode text; v_reps uuid[];
  v_count int; v_idx int; v_next_rep uuid; v_rules jsonb; v_rule jsonb;
  v_postcodes jsonb; v_pc text; i int; j int;
begin
  if auth.uid() is not null
     and p_company_id is distinct from public.current_company_id()
     and not public.is_super_admin() then
    raise exception 'route_lead: not authorised' using errcode = '42501';
  end if;

  select settings into v_settings from public.companies where id = p_company_id;
  v_routing := v_settings->'lead_routing';
  if v_routing is null then return null; end if;
  v_mode := v_routing->>'mode';
  if v_mode is null or v_mode = 'all' then return null; end if;
  select array_agg(user_id order by created_at) into v_reps from public.sales_reps
    where company_id = p_company_id and is_active = true;
  v_count := coalesce(array_length(v_reps,1),0);
  if v_count = 0 then return null; end if;
  if v_mode = 'round_robin' then
    v_idx := coalesce((v_routing->>'round_robin_index')::int, 0);
    v_next_rep := v_reps[(v_idx % v_count) + 1];
    update public.companies set settings = jsonb_set(coalesce(settings,'{}'),
      '{lead_routing,round_robin_index}', to_jsonb((v_idx + 1) % v_count)) where id = p_company_id;
    return v_next_rep;
  end if;
  if v_mode = 'postcode' and p_postcode is not null then
    v_rules := v_routing->'postcode_rules';
    if v_rules is not null and jsonb_array_length(v_rules) > 0 then
      for i in 0 .. jsonb_array_length(v_rules) - 1 loop
        v_rule := v_rules->i; v_postcodes := v_rule->'postcodes';
        if v_postcodes is not null then
          for j in 0 .. jsonb_array_length(v_postcodes) - 1 loop
            v_pc := v_postcodes->>j;
            if v_pc = p_postcode then return (v_rule->>'rep_id')::uuid;
            elsif v_pc like '%-%' then
              declare v_lo text := split_part(v_pc,'-',1); v_hi text := split_part(v_pc,'-',2);
              begin
                if lpad(p_postcode,10,'0') >= lpad(v_lo,10,'0') and lpad(p_postcode,10,'0') <= lpad(v_hi,10,'0')
                then return (v_rule->>'rep_id')::uuid; end if;
              end;
            end if;
          end loop;
        end if;
      end loop;
    end if;
    v_idx := coalesce((v_routing->>'round_robin_index')::int, 0);
    v_next_rep := v_reps[(v_idx % v_count) + 1];
    update public.companies set settings = jsonb_set(coalesce(settings,'{}'),
      '{lead_routing,round_robin_index}', to_jsonb((v_idx + 1) % v_count)) where id = p_company_id;
    return v_next_rep;
  end if;
  return null;
end $$;

-- ── 2. Service-role-only: revoke from both browser roles ────────────────────
-- Each of these has exactly one caller, and it is an edge function holding the
-- service role key. Named individually with full signatures rather than looped,
-- so adding an overload later does not silently inherit a revoke.
revoke execute on function public.activate_rental(uuid, text, text, text, text, text, text, text)          from anon, authenticated;
revoke execute on function public.activate_rental(uuid, text, text, text, text, text, text, text, boolean) from anon, authenticated;
revoke execute on function public.release_rental(text)                                                     from anon, authenticated;
revoke execute on function public.add_sms_credits(uuid, integer)                                           from anon, authenticated;
revoke execute on function public.deduct_sms_credit(uuid)                                                  from anon, authenticated;
revoke execute on function public.refund_sms_credit(uuid)                                                  from anon, authenticated;
revoke execute on function public.resolve_api_key(uuid, public.api_key_provider)                           from anon, authenticated;
revoke execute on function public.encrypt_api_key(text, uuid)                                              from anon, authenticated;
revoke execute on function public.decrypt_api_key(bytea, uuid)                                             from anon, authenticated;
revoke execute on function public.get_auth_user_id_by_email(text)                                          from anon, authenticated;
revoke execute on function public.clean_expired_magic_links()                                              from anon, authenticated;
revoke execute on function public.reset_monthly_sms_credits()                                              from anon, authenticated;

-- ── 3. Unused, and cross-company by shape ───────────────────────────────────
-- Nothing in any client or edge function calls these, and each takes an
-- arbitrary company/lead/user id rather than deriving it from the session, so
-- any account could read another company's data through them. If a UI needs one
-- later it should get a scope check first, the same as route_lead above.
revoke execute on function public.agreed_postcodes_at(uuid, timestamptz)  from anon, authenticated;
revoke execute on function public.get_dispute_eligibility(uuid)           from anon, authenticated;
revoke execute on function public.get_scrub_usage(uuid)                   from anon, authenticated;
revoke execute on function public.get_rep_visibility(uuid, text)          from anon, authenticated;
revoke execute on function public.has_permission(uuid, text)              from anon, authenticated;

-- ── 4. Trigger and event-trigger functions ──────────────────────────────────
-- Never legitimately called over RPC. Revoking cannot stop the triggers firing.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and pg_get_function_result(p.oid) in ('trigger', 'event_trigger')
  loop
    execute format('revoke execute on function %s from anon, authenticated', f.sig);
  end loop;
end $$;

-- ── 5. Self-scoped helpers: close to anon only ──────────────────────────────
-- current_company_id() and is_super_admin() read auth.uid() and return null /
-- false for an anonymous caller, so they leak nothing - but there is no reason
-- for anon to reach them. Kept for `authenticated`: both are used inside RLS
-- policies, which evaluate as the calling role. Confirmed first that no policy
-- granted to anon or public references either, so this cannot break a policy.
revoke execute on function public.current_company_id() from anon;
revoke execute on function public.is_super_admin()     from anon;

notify pgrst, 'reload schema';
