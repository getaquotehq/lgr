-- ============================================================================
-- Lead Gen Rentals - core schema
-- Marketplace where installers rent "assets" (lead funnels) per niche/region.
-- ============================================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- Niches (trade categories) ---------------------------------------------------
create table if not exists niches (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                 -- 'solar', 'hvac', 'renovations', 'roofing'
  name text not null,                        -- 'Residential Solar'
  short_desc text,                           -- ~12-word blurb for homepage picker
  status text not null default 'live'
    check (status in ('live','coming_soon','paused')),
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Regions (geographic areas where assets can operate) -------------------------
create table if not exists regions (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,                 -- 'brisbane', 'sydney-north', etc.
  name text not null,                        -- 'Brisbane'
  state text,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Installers (the buyers) -----------------------------------------------------
create table if not exists installers (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,               -- goes on lead consent
  contact_name text,
  email text unique not null,
  phone text,
  created_at timestamptz default now()
);

-- Assets (the rentable funnels) ----------------------------------------------
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  niche_id uuid references niches(id) on delete restrict not null,
  region_id uuid references regions(id) on delete restrict not null,
  tier text not null check (tier in ('starter','growth','scale')),
  brand_name text not null,                  -- '{{brand_name}}' shown on card
  brand_domain text,                         -- '{{brand_domain}}' shown on preview
  monthly_price_aud int not null,            -- whole dollars
  floor_leads int not null,                  -- guaranteed floor per 30 days
  typical_min int,                           -- typical range low
  typical_max int,                           -- typical range high
  status text not null default 'available'
    check (status in ('available','rented','maintenance')),
  rented_by uuid references installers(id) on delete set null, -- installer when rented
  rented_until date,                         -- current cycle end
  created_at timestamptz default now()
);

-- Leads (captured from asset funnels) ----------------------------------------
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references assets(id) on delete restrict not null,
  installer_id uuid references installers(id) on delete restrict not null,
  full_name text not null,
  email text,
  phone text not null,
  postcode text,
  extra jsonb,                               -- niche-specific fields (bill amount, timeline, etc.)
  status text not null default 'delivered'
    check (status in ('delivered','duplicate','invalid')),
  is_duplicate boolean default false,
  captured_at timestamptz default now()
);

-- Rentals (contract history - an asset can be rented, released, re-rented) ----
create table if not exists rentals (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references assets(id) on delete restrict not null,
  installer_id uuid references installers(id) on delete restrict not null,
  started_at timestamptz default now(),
  ended_at timestamptz,
  monthly_price_aud int not null,            -- snapshot at time of rental
  floor_leads int not null,
  created_at timestamptz default now()
);

-- Indexes --------------------------------------------------------------------
create index if not exists assets_niche_idx        on assets(niche_id);
create index if not exists assets_region_idx       on assets(region_id);
create index if not exists assets_status_idx       on assets(status);
create index if not exists leads_asset_idx         on leads(asset_id);
create index if not exists leads_installer_idx     on leads(installer_id);
-- Supports the per (asset_id, installer_id, phone) 30-day dedup lookup:
create index if not exists leads_dedup_idx         on leads(asset_id, installer_id, phone, captured_at desc);
create index if not exists rentals_asset_idx       on rentals(asset_id);
create index if not exists rentals_installer_idx   on rentals(installer_id);
