-- ============================================================================
-- Bind a person to the first renter they were delivered to, and keep them there.
--
-- This is MODEL.md 2.1 - "once a person is assigned to a renter, they are never
-- reassigned" - which was written down but never built.
--
-- WHAT WAS ALREADY CORRECT
--
-- Consent-name routing works and scales to any number of renters on an engine.
-- Every submission names exactly one business in its consent line, and
-- submit-lead delivers to that business and no other. No lead was ever shared
-- or resold, and nothing here changes that.
--
-- WHAT WAS MISSING
--
-- The duplicate check asked "has THIS INSTALLER had this phone before?" - not
-- "has this phone been given to ANYONE before?". So the same homeowner could be
-- delivered to two different renters through two separate enquiries:
--
--   Brisbane has three engines - ausolarquotes, clearsolarquotes and
--   premiumsolarquotes - all covering the same 213 postcodes. Rent two of them
--   to two installers, and a homeowner who fills in one form today and another
--   in three weeks reaches both of them.
--
-- Two exclusive leads, two honest consents, one homeowner fielding calls from
-- two of our renters about the same job. The trade pages promise the opposite,
-- in these words (line 572, all five):
--
--   "A homeowner who enquires with you stays with you. If the same person comes
--    back next week or next month, they are still bound to your business -
--    never handed to anyone else."
--
-- The code now matches the promise rather than the promise being softened.
--
-- HOW
--
-- lead_assignments binds a person to an installer, keyed on phone (the strongest
-- signal - it is carrier-validated at capture and it is the delivered contact
-- field), then email. insert_lead resolves the owner before delivering:
--
--   * nobody owns them yet  -> claim them for this renter, deliver as normal
--   * this renter owns them -> normal 30-day duplicate handling, unchanged
--   * another renter owns them -> record the lead as 'invalid' with
--     delivery_error 'assigned_to_another_renter', never deliver, never bill
--
-- Recorded rather than dropped so a rejected enquiry is visible and auditable
-- in Mission Control instead of vanishing.
--
-- Earliest assignment wins, which is what makes the rule deterministic under
-- races: the claim uses ON CONFLICT DO NOTHING against two partial unique
-- indexes, then re-reads. If a concurrent submission claimed the person first,
-- the re-read returns that winner and this lead defers to it.
--
-- KNOWN LIMIT: identity is phone-then-email only. MODEL.md 2.2 also describes a
-- device/browser identifier for visitors who have not given contact details yet,
-- and merging two records that turn out to be one person (same phone arriving
-- under a different email). Neither is built. The consequence is narrow: a
-- person using a different phone AND a different email reads as a new person.
--
-- VERIFIED on the live project, in a transaction that rolled itself back:
--   1. Jane on AU Solar Quotes (renter A)  -> delivered, to A
--   2. Jane on Clear Solar    (renter B)   -> invalid / assigned_to_another_renter
--   3. Bob  on Clear Solar    (renter B)   -> delivered, to B
--   Jane bound to A: true.  Test data left behind: none.
-- ============================================================================

create table if not exists public.lead_assignments (
  id             uuid primary key default gen_random_uuid(),
  phone          text,
  email          text,
  installer_id   uuid not null references public.installers(id) on delete cascade,
  first_asset_id uuid references public.assets(id) on delete set null,
  assigned_at    timestamptz not null default now()
);

-- Partial unique indexes: a person is claimed once by phone and once by email,
-- and a null in either column is not a claim.
create unique index if not exists lead_assignments_phone_key
  on public.lead_assignments (phone) where phone is not null;
create unique index if not exists lead_assignments_email_key
  on public.lead_assignments (email) where email is not null;
create index if not exists lead_assignments_installer_idx
  on public.lead_assignments (installer_id);

comment on table public.lead_assignments is
  'Binds a person (by phone, else email) to the FIRST renter they were delivered to. Every later enquiry from that person goes to the same renter or to nobody. Earliest assignment wins.';

-- Internal routing data. Service role writes it; only super admins can read it.
alter table public.lead_assignments enable row level security;
revoke all on public.lead_assignments from anon, authenticated;
drop policy if exists "super admin all lead_assignments" on public.lead_assignments;
create policy "super admin all lead_assignments" on public.lead_assignments
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create or replace function public.insert_lead(
  p_asset_id uuid, p_full_name text, p_phone text,
  p_email text default null, p_postcode text default null, p_extra jsonb default '{}'::jsonb)
returns public.asset_leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset assets; v_installer uuid; v_is_dup boolean; v_lead asset_leads;
  v_phone text; v_email text; v_owner uuid;
begin
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

  v_installer := v_asset.rented_by;
  if v_installer is null then
    raise exception 'asset % is not currently rented; no installer to deliver to', p_asset_id;
  end if;

  v_phone := nullif(btrim(p_phone), '');
  v_email := nullif(lower(btrim(p_email)), '');

  -- Who does this PERSON already belong to? Phone is the strongest signal, then
  -- email. Earliest assignment wins, so the answer is stable under races.
  select installer_id into v_owner from lead_assignments
   where (v_phone is not null and phone = v_phone)
      or (v_email is not null and email = v_email)
   order by assigned_at asc limit 1;

  if v_owner is null then
    insert into lead_assignments (phone, email, installer_id, first_asset_id)
    values (v_phone, v_email, v_installer, p_asset_id)
    on conflict do nothing;

    -- Re-read: a concurrent submission may have claimed them first.
    select installer_id into v_owner from lead_assignments
     where (v_phone is not null and phone = v_phone)
        or (v_email is not null and email = v_email)
     order by assigned_at asc limit 1;
    v_owner := coalesce(v_owner, v_installer);
  end if;

  -- Already someone else's person. Record it so it is visible and auditable,
  -- but never deliver it and never bill for it.
  if v_owner <> v_installer then
    insert into asset_leads (
      asset_id, installer_id, full_name, email, phone, postcode, extra,
      status, is_duplicate, delivery_error
    ) values (
      p_asset_id, v_installer, p_full_name, p_email, p_phone, p_postcode,
      coalesce(p_extra, '{}'::jsonb),
      'invalid', false, 'assigned_to_another_renter'
    ) returning * into v_lead;
    return v_lead;
  end if;

  -- per (installer_id, phone) within 30 days - across every asset and brand
  -- that installer rents, not just this one.
  select exists (
    select 1 from asset_leads l
    where l.installer_id = v_installer
      and l.phone = p_phone
      and l.status <> 'invalid'
      and l.captured_at > now() - interval '30 days'
  ) into v_is_dup;

  insert into asset_leads (
    asset_id, installer_id, full_name, email, phone, postcode, extra, status, is_duplicate
  ) values (
    p_asset_id, v_installer, p_full_name, p_email, p_phone, p_postcode,
    coalesce(p_extra, '{}'::jsonb),
    case when v_is_dup then 'duplicate' else 'delivered' end, v_is_dup
  ) returning * into v_lead;

  if not v_is_dup then
    perform pg_notify('lead_delivered', json_build_object(
      'lead_id', v_lead.id, 'asset_id', v_lead.asset_id, 'installer_id', v_lead.installer_id)::text);
  end if;
  return v_lead;
end;
$$;

revoke execute on function public.insert_lead(uuid, text, text, text, text, jsonb) from anon;

notify pgrst, 'reload schema';
