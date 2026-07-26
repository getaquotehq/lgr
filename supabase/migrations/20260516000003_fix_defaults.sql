-- =============================================================================
-- Fix: new account provisioning defaults and lead_scoring_enabled column default
-- =============================================================================
-- Changes:
--   1. lead_scoring_enabled column default: true → false
--   2. provision_sms_for_company: auto_reply and lead_scoring_enabled default to false
-- =============================================================================

-- Fix column-level default so any future direct inserts are also off by default
alter table public.sms_agent_config
  alter column lead_scoring_enabled set default false;

-- Recreate provision function with corrected defaults
create or replace function public.provision_sms_for_company()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  -- 1. Create SMS credit row
  insert into public.sms_credits (company_id, balance)
  values (new.id, 0)
  on conflict (company_id) do nothing;

  -- 2. Create default SMS agent config — all AI features off until explicitly enabled
  insert into public.sms_agent_config (company_id, name, auto_reply, is_active, lead_scoring_enabled)
  values (new.id, 'Default SMS Agent', false, false, false)
  on conflict do nothing;

  return new;
end;
$$;
