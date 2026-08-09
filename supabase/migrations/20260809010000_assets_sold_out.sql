-- Mark an asset (or a whole area) as SOLD OUT by hand.
--
-- Distinct from status='rented', which is set automatically when someone rents
-- an asset. sold_out is a manual "not for sale right now" that a human sets:
-- an area you are holding back, one you cannot fulfil, or one you have promised
-- verbally before the paperwork lands. It never changes automatically.

alter table public.assets
  add column if not exists sold_out boolean not null default false;

-- Partial index: the only query that matters is "which assets are still
-- sellable", so index the false side rather than the whole column.
create index if not exists assets_sold_out_idx
  on public.assets (sold_out) where sold_out = false;

comment on column public.assets.sold_out is
  'Manual hold. True = not offered for rent, regardless of status. Set by an admin, never automatically.';

-- Bulk helper: mark every live asset in a region sold out (or release them).
-- Super-admin only, same gate as the rest of the fleet controls. Done as one
-- statement rather than a client-side loop so it is atomic and the permission
-- check lives in the database, not just in the page.
create or replace function public.set_area_sold_out(
  p_region_id uuid,
  p_sold_out boolean,
  p_niche_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'set_area_sold_out: not authorised' using errcode = '42501';
  end if;

  update public.assets
     set sold_out = p_sold_out
   where region_id = p_region_id
     and deleted_at is null
     and (p_niche_id is null or niche_id = p_niche_id)
     and sold_out is distinct from p_sold_out;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.set_area_sold_out(uuid, boolean, uuid) from public, anon;
grant execute on function public.set_area_sold_out(uuid, boolean, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
