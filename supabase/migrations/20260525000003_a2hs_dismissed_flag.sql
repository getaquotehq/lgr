-- Track whether each user has dismissed the "Add to Home Screen" banner.
-- Storing in DB (not just localStorage) so the banner never reappears after
-- a browser storage clear or on a different device.
alter table public.profiles
  add column if not exists a2hs_dismissed boolean not null default false;
