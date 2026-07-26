alter table public.companies
  add column if not exists has_advertising_system boolean not null default false,
  add column if not exists advertising_system_purchased_at timestamptz;

comment on column public.companies.has_advertising_system is
  'True when the company has purchased the one-time $2,500 advertising system (unlocks AI SMS, Twilio, Meta/Google ads, landing pages).';
