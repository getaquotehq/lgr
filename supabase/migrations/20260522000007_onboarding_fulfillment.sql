alter table public.companies
  add column if not exists website_url            text,
  add column if not exists onboarding_completed   boolean default false,
  add column if not exists lead_goals             integer,
  add column if not exists max_daily_ad_spend     numeric(10,2),
  add column if not exists meta_ad_account_id     text,
  add column if not exists google_ads_customer_id text,
  add column if not exists onboarding_images      jsonb default '[]'::jsonb,
  add column if not exists generated_page_url     text,
  add column if not exists generated_page_repo    text,
  add column if not exists generated_ad_copy      jsonb default '{}'::jsonb;
