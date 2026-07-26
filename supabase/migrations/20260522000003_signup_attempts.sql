create table if not exists public.signup_attempts (
  id                uuid primary key default gen_random_uuid(),
  type              text not null,  -- 'ppl_signup' | 'advertising_system'
  first_name        text,
  last_name         text,
  email             text,
  phone             text,
  company           text,
  -- PPL fields
  niche             text,
  area_city         text,
  quantity          int,
  price_per_lead    decimal(10,2),
  -- Advertising system fields
  industry          text,
  service_location  text,
  service_radius    text,
  special_offers    text,
  -- Stripe
  stripe_session_id text,
  status            text not null default 'pending',  -- 'pending' | 'completed'
  created_at        timestamptz default now()
);

alter table public.signup_attempts enable row level security;

-- Only service role can read/write (super admin views via service role)
create policy "signup_attempts_service"
  on public.signup_attempts for all
  using (auth.role() = 'service_role');
