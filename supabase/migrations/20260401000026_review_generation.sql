-- =============================================================================
-- Review Generation System
-- =============================================================================
-- Enables companies to automatically request Google reviews from customers
-- after a deal is marked as closed_won. Supports configurable delay, custom
-- message templates, and auto-send or manual review modes.
-- =============================================================================

-- ─── Review config on sms_agent_config ───────────────────────────────────────
-- Store review request settings alongside existing SMS agent config.
alter table public.sms_agent_config
  add column if not exists review_enabled          boolean default false,
  add column if not exists review_delay_days       int default 7,
  add column if not exists review_auto_send        boolean default false,
  add column if not exists review_message          text default 'Hi {{first_name}}, thank you for choosing us! We''d love your feedback — please leave us a Google review: {{review_link}}',
  add column if not exists google_review_link      text;

comment on column public.sms_agent_config.review_enabled      is 'Enable review request SMS after closed_won.';
comment on column public.sms_agent_config.review_delay_days   is 'Days after closed_won before sending review request.';
comment on column public.sms_agent_config.review_auto_send    is 'When true, sends review SMS automatically. When false, creates a pending request for manual approval.';
comment on column public.sms_agent_config.review_message      is 'Template for review request SMS. Supports {{first_name}} and {{review_link}} placeholders.';
comment on column public.sms_agent_config.google_review_link  is 'Google review URL for the business.';

-- ─── Review requests table ──────────────────────────────────────────────────
-- Tracks individual review request records (pending, sent, or skipped).
create table if not exists public.review_requests (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  lead_id         uuid not null references public.leads(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  scheduled_at    timestamptz not null,
  sent_at         timestamptz,
  message_body    text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_review_requests_company on public.review_requests (company_id);
create index if not exists idx_review_requests_status  on public.review_requests (company_id, status);
create index if not exists idx_review_requests_scheduled on public.review_requests (status, scheduled_at);
create index if not exists idx_review_requests_lead on public.review_requests (lead_id);

-- Prevent duplicate review requests for the same lead
create unique index if not exists idx_review_requests_lead_unique
  on public.review_requests (lead_id) where status in ('pending', 'sent');

create trigger set_updated_at before update on public.review_requests
  for each row execute function public.set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.review_requests enable row level security;

create policy "Company members can view review requests"
  on public.review_requests for select
  using (company_id in (select company_id from public.profiles where id = auth.uid()));

create policy "Company admins can manage review requests"
  on public.review_requests for all
  using (company_id in (select company_id from public.profiles where id = auth.uid()));
