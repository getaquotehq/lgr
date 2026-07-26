alter table public.companies
  add column if not exists testimonials jsonb;
