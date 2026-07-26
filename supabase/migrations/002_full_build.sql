-- =============================================================================
-- 002_full_build.sql — Plan types, PPL tables, Meta connections
-- =============================================================================

-- Add plan + Stripe fields to companies
alter table companies
  add column if not exists plan text default 'managed',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists status text default 'active';

-- PPL pricing table
create table if not exists ppl_pricing (
  id uuid default gen_random_uuid() primary key,
  niche text not null,
  area text not null,
  price_per_lead decimal(10,2) not null,
  min_quantity int default 10,
  max_quantity int default 100,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(niche, area)
);

alter table ppl_pricing enable row level security;

create policy "Service role full access on ppl_pricing"
  on ppl_pricing for all using (auth.role() = 'service_role');

create policy "Authenticated users can read ppl_pricing"
  on ppl_pricing for select using (auth.role() = 'authenticated');

-- Seed pricing
insert into ppl_pricing (niche, area, price_per_lead, min_quantity, max_quantity) values
  ('solar',      'brisbane',   85.00, 10, 100),
  ('solar',      'gold_coast', 85.00, 10, 100),
  ('solar',      'sydney',     90.00, 10, 100),
  ('solar',      'melbourne',  90.00, 10, 100),
  ('roofing',    'brisbane',   75.00, 10, 100),
  ('roofing',    'gold_coast', 75.00, 10, 100),
  ('roofing',    'sydney',     80.00, 10, 100),
  ('hvac',       'brisbane',   70.00, 10, 100),
  ('hvac',       'gold_coast', 70.00, 10, 100),
  ('hvac',       'sydney',     75.00, 10, 100),
  ('renovation', 'brisbane',   95.00, 10, 100),
  ('renovation', 'gold_coast', 95.00, 10, 100),
  ('renovation', 'sydney',    100.00, 10, 100)
on conflict (niche, area) do nothing;

-- PPL campaigns table (Lead Gen Rentals' own Meta/Google campaign IDs)
create table if not exists ppl_campaigns (
  id uuid default gen_random_uuid() primary key,
  niche text not null,
  area text not null,
  platform text not null check (platform in ('meta', 'google')),
  campaign_id text not null,
  ad_account_id text,
  status text default 'paused' check (status in ('active', 'paused')),
  cost_per_lead decimal(10,2),
  is_available boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table ppl_campaigns enable row level security;

create policy "Service role full access on ppl_campaigns"
  on ppl_campaigns for all using (auth.role() = 'service_role');

create policy "Super admins can manage ppl_campaigns"
  on ppl_campaigns for all using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.is_admin = true
    )
  );

-- PPL lead orders
create table if not exists ppl_lead_orders (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  niche text not null,
  area text not null,
  quantity int not null,
  price_per_lead decimal(10,2) not null,
  total_amount decimal(10,2) not null,
  delivered_count int default 0,
  status text default 'pending' check (status in ('pending', 'paid', 'active', 'fulfilled', 'cancelled')),
  stripe_payment_intent_id text,
  stripe_session_id text,
  campaigns_activated boolean default false,
  twilio_provisioned boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table ppl_lead_orders enable row level security;

create policy "Users can view own ppl orders"
  on ppl_lead_orders for select using (
    company_id in (
      select company_id from profiles where id = auth.uid()
    )
  );

create policy "Service role full access on ppl_lead_orders"
  on ppl_lead_orders for all using (auth.role() = 'service_role');

-- Meta connections
create table if not exists meta_connections (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references companies(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  access_token text not null,
  token_expires_at timestamptz,
  business_manager_id text,
  ad_account_id text,
  ad_account_name text,
  status text default 'connected',
  connected_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(company_id)
);

alter table meta_connections enable row level security;

create policy "Users can view own meta connection"
  on meta_connections for select using (
    company_id in (
      select company_id from profiles where id = auth.uid()
    )
  );

create policy "Service role full access on meta_connections"
  on meta_connections for all using (auth.role() = 'service_role');

-- Add twilio_sid to twilio_numbers
alter table twilio_numbers
  add column if not exists twilio_sid text;
