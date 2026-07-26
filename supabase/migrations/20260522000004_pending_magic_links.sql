create table if not exists public.pending_magic_links (
  stripe_session_id text primary key,
  magic_link        text not null,
  created_at        timestamptz default now(),
  expires_at        timestamptz default now() + interval '1 hour'
);

-- No RLS — service role only, accessed exclusively via the get-magic-link edge function
alter table public.pending_magic_links enable row level security;

create policy "pending_magic_links_service"
  on public.pending_magic_links for all
  using (auth.role() = 'service_role');

-- Auto-clean expired links
create or replace function public.clean_expired_magic_links()
returns void language sql security definer as $$
  delete from public.pending_magic_links where expires_at < now();
$$;
