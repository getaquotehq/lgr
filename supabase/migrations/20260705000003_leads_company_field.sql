-- Add a business/company-name field on leads, distinct from leads.company_id
-- (the FK to the tenant that owns the lead). This is the name of the trade
-- business the lead is FROM — needed for the super-admin's own agency SMS
-- flow, where leads are trade businesses, not homeowners.

alter table public.leads
  add column if not exists company text;
