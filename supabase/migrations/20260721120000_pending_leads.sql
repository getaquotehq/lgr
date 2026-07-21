-- ============================================================================
-- pending_leads — the "held" pool.
--
-- The model: a homeowner can become a lead on ANY area page, whatever their
-- postcode. Delivery still has a HARD gate — a lead is only handed to an
-- installer when a currently-rented asset's client covers that postcode AND
-- the consent named them (submit-lead's existing routing). When nothing
-- matches, the lead is NOT dropped: it lands here, pending, until a client
-- covering that postcode exists.
--
-- Written by submit-lead (service role) on a no-match outcome. Admin / Mission
-- Control reads + resolves. No anon access — the public raw safety net is
-- lead_submissions; this is the workflow queue.
-- ============================================================================
create table if not exists pending_leads (
  id uuid primary key default gen_random_uuid(),
  brand_domain text,
  niche text,
  source text,
  full_name text,
  phone text,
  email text,
  postcode text,
  consent_text text,
  reason text,                              -- out_of_area | unmatched_consent | no_inventory
  extra jsonb not null default '{}'::jsonb,
  status text not null default 'pending',   -- pending | delivered | discarded
  delivered_lead_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists pending_leads_status_idx   on pending_leads(status, created_at desc);
create index if not exists pending_leads_postcode_idx on pending_leads(postcode) where status = 'pending';
create index if not exists pending_leads_phone_idx    on pending_leads(phone);

alter table pending_leads enable row level security;

drop policy if exists "admin read pending"   on pending_leads;
drop policy if exists "admin update pending"  on pending_leads;

-- admin (Mission Control) reads and works the queue; service role (submit-lead)
-- bypasses RLS entirely, so no insert policy is needed for it.
create policy "admin read pending"  on pending_leads for select to authenticated using (true);
create policy "admin update pending" on pending_leads for update to authenticated using (true) with check (true);

grant select, update on pending_leads to authenticated;
