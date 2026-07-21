-- ============================================================================
-- Raw lead-capture table — the cws-site pattern. Every funnel submission that
-- passes the postcode gate is written here by a DIRECT anon insert from the
-- landing page, in parallel with submit-lead's routing. This is the safety net:
-- even if the edge function / routing hiccups, the lead is never lost.
--
-- anon may INSERT only (public funnels write here); it can never read. Admin
-- (authenticated / Mission Control) may read. Service role bypasses RLS.
-- ============================================================================
create table if not exists lead_submissions (
  id uuid primary key default gen_random_uuid(),
  brand_domain text,
  niche text,
  source text,
  first_name text,
  last_name text,
  name text,
  email text,
  phone text,
  postcode text,
  is_homeowner boolean,
  ownership_type text,
  purchase_timeline text,
  avg_quarterly_bill text,
  matched_buyer text,
  consent_text text,
  created_at timestamptz default now()
);
create index if not exists lead_submissions_created_idx on lead_submissions(created_at desc);
create index if not exists lead_submissions_phone_idx   on lead_submissions(phone);

alter table lead_submissions enable row level security;

drop policy if exists "anon insert submissions"  on lead_submissions;
drop policy if exists "admin read submissions"    on lead_submissions;

-- public funnels: insert-only, no read
create policy "anon insert submissions" on lead_submissions
  for insert to anon, authenticated with check (true);
-- admin: read the raw capture in Mission Control
create policy "admin read submissions" on lead_submissions
  for select to authenticated using (true);

grant insert on lead_submissions to anon, authenticated;
grant select on lead_submissions to authenticated;
