-- =============================================================================
-- LeadGenRentalsHQ — Migration 006: Ensure SMS Agent Config Columns
-- =============================================================================
-- Idempotent fix: migration 004 may not have applied the sms_agent_config
-- ALTER TABLE if earlier CREATE TABLE statements failed (table already existed).
-- This ensures all dashboard-expected columns are present.
-- =============================================================================

alter table public.sms_agent_config
  add column if not exists agent_name              text,
  add column if not exists special_offers           text,
  add column if not exists welcome_message          text default 'Hi {{first_name}}, thanks for reaching out!',
  add column if not exists service_locations        jsonb default '[]',
  add column if not exists max_travel_distance      int default 50,
  add column if not exists max_travel_distance_unit text default 'km',
  add column if not exists preparation_required     text,
  add column if not exists automate_quote_followup  boolean default false,
  add column if not exists followup_message         text default 'Hi {{first_name}}, just following up on your quote!',
  add column if not exists days_until_followup      int default 3,
  add column if not exists ai_nurture_enabled       boolean default true,
  add column if not exists lead_scoring_enabled     boolean default false,
  add column if not exists max_sms_words            int default 15,
  add column if not exists reply_delay_seconds      int default 0,
  add column if not exists auto_call_inbound        boolean default false;
