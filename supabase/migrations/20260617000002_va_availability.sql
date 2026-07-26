-- VA weekly call availability.
-- One row per VA. `slots` is an array of "day-hour" keys the VA has marked as
-- available, e.g. ["mon-9","mon-10","tue-14"]. Reachable only via the va-api
-- edge function (service role), like the other VA tables — RLS on, no
-- permissive policies, so nothing existing is affected.
create table if not exists public.va_availability (
  va_user_id uuid primary key references auth.users(id) on delete cascade,
  slots      jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.va_availability enable row level security;
