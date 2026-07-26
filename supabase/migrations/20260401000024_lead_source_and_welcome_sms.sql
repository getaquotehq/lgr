-- =============================================================================
-- LeadGenRentalsHQ — Migration 024: Lead Source Options & Auto-Send Welcome SMS
-- =============================================================================
-- 1. Add auto_send_welcome toggle to sms_agent_config so companies can opt in
--    to sending a customizable first message as soon as a new lead is created.
-- 2. The existing welcome_message column already supports {{first_name}}.
-- =============================================================================

-- ─── Auto-send welcome message toggle ────────────────────────────────────────
alter table public.sms_agent_config
  add column if not exists auto_send_welcome boolean default false;

comment on column public.sms_agent_config.auto_send_welcome is
  'When true, automatically send the welcome_message SMS to every new lead that has a phone number.';
