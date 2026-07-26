-- SMS opt-out tracking for customer leads. Set true when a lead replies STOP /
-- UNSUBSCRIBE etc. The AI SMS agent, manual sends, and bulk SMS must NEVER
-- message an opted-out lead (Australian Spam Act requirement). Cleared if the
-- lead replies START to resubscribe.
alter table public.leads add column if not exists sms_opted_out boolean not null default false;
alter table public.leads add column if not exists sms_opted_out_at timestamptz;

create index if not exists idx_leads_sms_opted_out
  on public.leads (sms_opted_out) where sms_opted_out;
