alter table public.companies
  add column if not exists meta_page_id           text,
  add column if not exists meta_campaign_id       text,
  add column if not exists meta_ad_set_ids        jsonb default '[]'::jsonb,
  add column if not exists meta_ad_ids            jsonb default '[]'::jsonb,
  add column if not exists google_campaign_id     text,
  add column if not exists google_ad_group_id     text,
  add column if not exists campaign_status        text default 'none',
  add column if not exists campaigns_created_at   timestamptz;
