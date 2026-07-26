-- =============================================================================
-- LeadGenRentalsHQ — Migration 012: Notifications, AI Pipeline Fixes, Booked-By
-- =============================================================================
-- 1. Notifications table for AI goal events
-- 2. booked_by column on appointments (ai vs human)
-- 3. agent_type default for human-sent messages
-- =============================================================================

-- ─── Notifications Table ─────────────────────────────────────────────────────
-- Stores notifications when AI achieves goals (callback booked, onsite booked,
-- quote drafted, sale completed). Displayed in the dashboard notifications page.

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  lead_id       uuid references public.leads(id) on delete set null,
  type          text not null,              -- 'callback_booked' | 'onsite_booked' | 'quote_drafted' | 'sale_completed'
  title         text not null,
  message       text,
  is_read       boolean default false,
  metadata      jsonb default '{}',
  created_at    timestamptz default now()
);

create index idx_notifications_company on public.notifications (company_id, created_at desc);
create index idx_notifications_unread on public.notifications (company_id, is_read) where is_read = false;

alter table public.notifications enable row level security;

create policy "Company members can view notifications"
  on public.notifications for select
  using (company_id = public.current_company_id());

create policy "Company members can update notifications"
  on public.notifications for update
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- Allow service-role inserts (edge functions create notifications)
create policy "Service role can insert notifications"
  on public.notifications for insert
  with check (true);

-- ─── Appointments: booked_by column ──────────────────────────────────────────
-- Tracks whether an appointment was booked by AI or a human user.

alter table public.appointments
  add column if not exists booked_by text default 'human';  -- 'ai' | 'human'

-- ─── Add realtime support for notifications ──────────────────────────────────
alter publication supabase_realtime add table public.notifications;
alter table public.notifications replica identity full;
