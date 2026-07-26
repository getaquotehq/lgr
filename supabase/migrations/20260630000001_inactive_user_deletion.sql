-- Track inactive users and pending deletions
alter table public.profiles
  add column if not exists inactive_marked_at   timestamptz,
  add column if not exists deletion_notice_sent_at timestamptz,
  add column if not exists deletion_token       uuid;

create index idx_profiles_inactive on public.profiles (inactive_marked_at)
  where inactive_marked_at is not null;

create index idx_profiles_deletion_token on public.profiles (deletion_token)
  where deletion_token is not null;
