-- Lock PPL service areas by default; admins unlock per-request.

alter table public.companies
  add column if not exists ppl_area_locked boolean not null default true;

-- Tracks user requests to change their PPL service areas.
create table if not exists public.ppl_area_change_requests (
  id          uuid        primary key default gen_random_uuid(),
  company_id  uuid        not null references public.companies(id) on delete cascade,
  message     text,
  status      text        not null default 'pending'
                          check (status in ('pending','approved','rejected')),
  admin_notes text,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.ppl_area_change_requests enable row level security;

-- Users read their own company's requests
create policy "pacr_select_own" on public.ppl_area_change_requests
  for select using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

-- Users create requests for their own company
create policy "pacr_insert_own" on public.ppl_area_change_requests
  for insert with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );
