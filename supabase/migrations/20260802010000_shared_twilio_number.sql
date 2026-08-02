-- =============================================================================
-- Lead Gen Rentals — Shared Twilio Number (platform_settings)
-- =============================================================================
-- Every LGR company shares the same Twilio number instead of each getting a
-- dedicated one purchased per signup (mirrors ql-hq's PPL shared-number
-- model). The number is admin-configurable here instead of hardcoded, and
-- inbound replies are routed to the right company by matching the lead's
-- phone number (see twilio-inbound-sms) - never by which company "owns" the
-- number. This table just holds that one setting.
-- =============================================================================

create table if not exists public.platform_settings (
  id                    smallint primary key default 1,
  shared_twilio_number  text,
  updated_at            timestamptz default now(),
  constraint platform_settings_singleton check (id = 1)
);

-- Seeded with the number in use today - change it any time from /admin
-- (Shared SMS Number), no code deploy required.
insert into public.platform_settings (id, shared_twilio_number)
values (1, '+61485016260')
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

-- Service-role only: read/written exclusively by provision-twilio and the
-- admin API (impersonate-user), both using the service role key which
-- bypasses RLS. No policy is added, so anon/authenticated clients get nothing.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'platform_settings' loop
    execute format('drop policy if exists %I on public.platform_settings', p.policyname);
  end loop;
end $$;
