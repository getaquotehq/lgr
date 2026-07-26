-- =============================================================================
-- Add email and phone columns to companies table
-- =============================================================================
-- The quote-public edge function returns company contact info (email, phone)
-- to the external quote viewer so recipients can reach the company directly.
-- =============================================================================

alter table public.companies
  add column if not exists email text,
  add column if not exists phone text;
