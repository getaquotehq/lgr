-- Demo request submissions from the public landing page
create table public.demo_requests (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  phone      text,
  company    text,
  created_at timestamptz default now()
);

-- Allow anonymous inserts (public form, no auth required)
alter table public.demo_requests enable row level security;

create policy "Anyone can insert demo requests"
  on public.demo_requests for insert
  with check (true);

-- No select/update/delete for anon – only service role can read
create policy "Service role can read demo requests"
  on public.demo_requests for select
  using (auth.role() = 'service_role');
