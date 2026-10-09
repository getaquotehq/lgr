-- Drop the storage behind the features retired in October 2026 (see
-- DASHBOARD.md): the public API and outbound webhooks, Google review requests,
-- and the VA console. Nothing in the dashboard, admin, Mission Control or any
-- edge function reads or writes these any more.
--
-- Their RLS policies, indexes, triggers and realtime publication membership go
-- with the tables.

begin;

-- Public API + outbound webhooks (20260401000018, 20260705000010)
drop table if exists public.webhook_deliveries;
drop table if exists public.webhook_endpoints;
drop table if exists public.company_api_tokens;

-- Google review requests (20260401000026)
drop table if exists public.review_requests;
alter table public.sms_agent_config
  drop column if exists review_enabled,
  drop column if exists review_delay_days,
  drop column if exists review_auto_send,
  drop column if exists review_message,
  drop column if exists google_review_link;

-- VA console (20260617000001, 20260617000002)
drop table if exists public.va_availability;
drop table if exists public.va_assignments;
alter table public.profiles drop column if exists is_va;

commit;
