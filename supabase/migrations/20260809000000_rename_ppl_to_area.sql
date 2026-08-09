-- ============================================================================
-- Drop the "ppl" prefix everywhere. This is not a pay-per-lead business - it
-- rents an area or an asset for a fixed period - and the old naming has been
-- causing exactly the confusion you would expect, including in this repo.
--
--   TABLES    ppl_pricing               -> area_pricing
--             ppl_orders                -> area_orders
--             ppl_lead_orders           -> area_lead_orders
--             ppl_campaigns             -> area_campaigns
--             ppl_call_attempts         -> area_call_attempts
--             ppl_area_change_requests  -> area_change_requests
--             ppl_area_history          -> area_history
--
--   COLUMNS   companies.ppl_scrub_cap_pct    -> scrub_cap_pct
--             companies.ppl_area_locked      -> area_locked
--             companies.ppl_agreed_postcodes -> agreed_postcodes
--             leads.is_ppl                   -> is_area_lead
--             leads.ppl_scrubbed             -> scrubbed
--
--   FUNCTIONS get_ppl_dispute_eligibility    -> get_dispute_eligibility
--             get_ppl_scrub_usage            -> get_scrub_usage
--             increment_ppl_order_delivered  -> increment_area_order_delivered
--             notify_ppl_area_change_request -> notify_area_change_request
--             ppl_agreed_postcodes_at        -> agreed_postcodes_at
--             record_ppl_area_change         -> record_area_change
--             sync_is_ppl_from_source        -> sync_is_area_lead_from_source
--
-- Renaming a table or column carries its indexes, constraints, foreign keys and
-- RLS policies with it, so none of those need touching. Function BODIES do not
-- follow - plpgsql resolves names at runtime, so a body still saying ppl_orders
-- would compile fine and fail on first call. Those are rewritten below from
-- each function's own live definition rather than retyped, then renamed with
-- ALTER FUNCTION so the OID is preserved and existing triggers keep pointing at
-- the right function.
-- ============================================================================

-- ── 1. tables ───────────────────────────────────────────────────────────────
alter table if exists public.ppl_pricing              rename to area_pricing;
alter table if exists public.ppl_orders               rename to area_orders;
alter table if exists public.ppl_lead_orders          rename to area_lead_orders;
alter table if exists public.ppl_campaigns            rename to area_campaigns;
alter table if exists public.ppl_call_attempts        rename to area_call_attempts;
alter table if exists public.ppl_area_change_requests rename to area_change_requests;
alter table if exists public.ppl_area_history         rename to area_history;

-- ── 2. columns ──────────────────────────────────────────────────────────────
alter table public.companies rename column ppl_scrub_cap_pct    to scrub_cap_pct;
alter table public.companies rename column ppl_area_locked      to area_locked;
alter table public.companies rename column ppl_agreed_postcodes to agreed_postcodes;
alter table public.leads     rename column is_ppl               to is_area_lead;
alter table public.leads     rename column ppl_scrubbed         to scrubbed;

-- ── 3. function bodies, rewritten from their own definitions ────────────────
-- Longest identifiers first: ppl_agreed_postcodes_at contains
-- ppl_agreed_postcodes, and ppl_area_change_requests contains the function name
-- notify_ppl_area_change_request minus its plural. Replacing short before long
-- would corrupt both.
do $rename$
declare
  r        record;
  def      text;
  pass     int;
  pairs    text[][] := array[
    ['ppl_area_change_requests','area_change_requests'],
    ['ppl_agreed_postcodes_at','agreed_postcodes_at'],
    ['ppl_agreed_postcodes','agreed_postcodes'],
    ['ppl_call_attempts','area_call_attempts'],
    ['ppl_scrub_cap_pct','scrub_cap_pct'],
    ['ppl_area_history','area_history'],
    ['ppl_lead_orders','area_lead_orders'],
    ['ppl_area_locked','area_locked'],
    ['ppl_campaigns','area_campaigns'],
    ['ppl_scrubbed','scrubbed'],
    ['ppl_pricing','area_pricing'],
    ['ppl_orders','area_orders'],
    ['is_ppl','is_area_lead']
  ];
  fnpairs  text[][] := array[
    ['get_ppl_dispute_eligibility','get_dispute_eligibility'],
    ['increment_ppl_order_delivered','increment_area_order_delivered'],
    ['notify_ppl_area_change_request','notify_area_change_request'],
    ['record_ppl_area_change','record_area_change'],
    ['get_ppl_scrub_usage','get_scrub_usage'],
    ['sync_is_ppl_from_source','sync_is_area_lead_from_source'],
    ['ppl_agreed_postcodes_at','agreed_postcodes_at']
  ];
  i int;
begin
  -- pass 1: fix table/column references inside every affected body, keeping the
  -- function's current name so triggers and grants are untouched.
  -- pass 2: after the renames below, fix any body that CALLS a renamed function.
  for pass in 1..2 loop
    for r in
      select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and (p.prosrc ilike '%ppl_%' or p.prosrc ilike '%is_ppl%' or p.proname ilike '%ppl%')
    loop
      def := pg_get_functiondef(r.oid);

      for i in 1 .. array_length(pairs, 1) loop
        def := replace(def, pairs[i][1], pairs[i][2]);
      end loop;

      if pass = 2 then
        for i in 1 .. array_length(fnpairs, 1) loop
          -- only rewrite CALLS in the body; the header already carries the new
          -- name by this point, so this is a no-op on the signature line.
          def := replace(def, fnpairs[i][1], fnpairs[i][2]);
        end loop;
      end if;

      execute def;
    end loop;

    -- rename after pass 1 only
    if pass = 1 then
      alter function public.get_ppl_dispute_eligibility(uuid)    rename to get_dispute_eligibility;
      alter function public.get_ppl_scrub_usage(uuid)            rename to get_scrub_usage;
      alter function public.increment_ppl_order_delivered()      rename to increment_area_order_delivered;
      alter function public.notify_ppl_area_change_request()     rename to notify_area_change_request;
      alter function public.ppl_agreed_postcodes_at(uuid, timestamptz) rename to agreed_postcodes_at;
      alter function public.record_ppl_area_change()             rename to record_area_change;
      alter function public.sync_is_ppl_from_source()            rename to sync_is_area_lead_from_source;
    end if;
  end loop;
end
$rename$;

notify pgrst, 'reload schema';
