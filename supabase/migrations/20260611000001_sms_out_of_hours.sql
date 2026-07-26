-- Add out_of_hours_only toggle to sms_agent_config.
-- When true, the AI only auto-replies outside Mon–Fri 9am–5pm AEST (UTC+10).
-- Business hours responses are stored but not replied to, identical to when
-- auto_reply is off. Defaults to false so existing behaviour is unchanged.

alter table public.sms_agent_config
  add column if not exists out_of_hours_only boolean not null default false;
