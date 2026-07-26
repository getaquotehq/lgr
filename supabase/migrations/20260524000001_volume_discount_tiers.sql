-- =============================================================================
-- Volume discount tiers for PPL lead packs
-- Seeded with the 4 standard tiers; editable from /admin discount editor.
-- =============================================================================

create table if not exists public.volume_discount_tiers (
  id               uuid  primary key default gen_random_uuid(),
  min_quantity     int   not null,
  discount_percent int   not null,
  label            text  not null,
  is_popular       bool  not null default false,
  active           bool  not null default true,
  sort_order       int   not null default 0
);

alter table public.volume_discount_tiers enable row level security;

-- Service role can do anything (used by edge functions)
create policy "Service role full access on volume_discount_tiers"
  on public.volume_discount_tiers for all
  using (auth.role() = 'service_role');

-- Authenticated clients (dashboard + public site via API) can read
create policy "Authenticated users can read volume_discount_tiers"
  on public.volume_discount_tiers for select
  using (auth.role() = 'authenticated');

-- Super-admins can write directly from the admin panel
create policy "Super admins can manage volume_discount_tiers"
  on public.volume_discount_tiers for all
  using (public.is_super_admin());

-- Also grant super-admins write access to ppl_pricing so the existing
-- admin pricing editor can save changes (previously only service_role could write)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'ppl_pricing'
      and policyname = 'Super admins can manage ppl_pricing'
  ) then
    execute $$
      create policy "Super admins can manage ppl_pricing"
        on public.ppl_pricing for all
        using (public.is_super_admin())
    $$;
  end if;
end;
$$;

-- Seed the four standard tiers (25 leads marked popular)
insert into public.volume_discount_tiers
  (min_quantity, discount_percent, label, is_popular, active, sort_order)
values
  (10,  0,  '10 leads',  false, true, 1),
  (25,  5,  '25 leads',  true,  true, 2),
  (50,  10, '50 leads',  false, true, 3),
  (100, 15, '100 leads', false, true, 4);
