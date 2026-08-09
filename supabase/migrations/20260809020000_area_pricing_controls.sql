-- Per-area pricing.
--
-- Price lives on the asset and nowhere else. A separate "area price" table was
-- the obvious alternative and was deliberately not built: it would duplicate a
-- number that assets already carry, and the two would drift the first time
-- anyone edited an asset directly. This sets the assets instead, in bulk.

create or replace function public.set_area_pricing(
  p_region_id uuid,
  p_tier      text default null,   -- null = every tier in the area
  p_price     integer default null,-- null = leave price alone
  p_floor     integer default null,-- null = leave floor alone
  p_niche_id  uuid default null    -- null = every trade in the area
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'set_area_pricing: not authorised' using errcode = '42501';
  end if;

  if p_price is null and p_floor is null then
    raise exception 'set_area_pricing: nothing to change';
  end if;
  if p_price is not null and p_price <= 0 then
    raise exception 'set_area_pricing: price must be above zero';
  end if;
  -- floor divides the fee to give the per-lead ceiling the site promises, so a
  -- zero floor would mean an unbounded price per lead.
  if p_floor is not null and p_floor <= 0 then
    raise exception 'set_area_pricing: floor must be at least 1 lead';
  end if;

  update public.assets
     set monthly_price_aud = coalesce(p_price, monthly_price_aud),
         floor_leads       = coalesce(p_floor, floor_leads)
   where region_id = p_region_id
     and deleted_at is null
     and (p_tier     is null or tier     = p_tier)
     and (p_niche_id is null or niche_id = p_niche_id)
     and (monthly_price_aud is distinct from coalesce(p_price, monthly_price_aud)
       or floor_leads       is distinct from coalesce(p_floor, floor_leads));

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.set_area_pricing(uuid, text, integer, integer, uuid) from public, anon;
grant execute on function public.set_area_pricing(uuid, text, integer, integer, uuid) to authenticated, service_role;

-- What each area currently charges, and the per-lead ceiling that implies.
-- The ceiling is fee / floor - the same arithmetic the public site now
-- describes in words rather than as a fixed dollar figure.
create or replace view public.area_pricing_overview as
select r.id                as region_id,
       r.name              as region_name,
       r.slug              as region_slug,
       a.niche_id,
       a.tier,
       count(*)                                  as assets,
       min(a.monthly_price_aud)                  as price_min,
       max(a.monthly_price_aud)                  as price_max,
       min(a.floor_leads)                        as floor_min,
       max(a.floor_leads)                        as floor_max,
       round(max(a.monthly_price_aud)::numeric
             / nullif(min(a.floor_leads),0), 2)  as worst_case_per_lead,
       bool_or(a.sold_out)                       as any_held
from public.regions r
join public.assets  a on a.region_id = r.id and a.deleted_at is null
group by r.id, r.name, r.slug, a.niche_id, a.tier;

grant select on public.area_pricing_overview to authenticated, service_role;

notify pgrst, 'reload schema';
