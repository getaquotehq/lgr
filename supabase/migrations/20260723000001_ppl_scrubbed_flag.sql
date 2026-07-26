-- ============================================================================
-- ppl_scrubbed: marks a PPL lead as scrubbed/credited in ql-mc.
--
-- Set by sync-from-mc {action:'scrub'} when ql-mc scrubs the lead (matched by
-- phone + name + company, all exact). A scrubbed lead has already been
-- credited back to the client, so dispute-lead hard-blocks any new dispute on
-- it - no double-dipping a lead that's already been replaced.
-- ============================================================================
alter table public.leads
  add column if not exists ppl_scrubbed boolean not null default false;

create index if not exists idx_leads_ppl_scrubbed
  on public.leads (company_id)
  where ppl_scrubbed = true;
