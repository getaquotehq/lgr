-- Hard-delete RPCs for Mission Control cleanup. SECURITY DEFINER so they can
-- remove the FK-restricted child rows first, then the parent. Admin-only.

create or replace function hard_delete_asset(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from leads            where asset_id = p_id;   -- cascades lead_delivery_log
  delete from rentals          where asset_id = p_id;
  delete from rental_checkouts where asset_id = p_id;
  delete from assets           where id = p_id;
end $$;

create or replace function hard_delete_installer(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- free any asset this business currently rents
  update assets set status='available', rented_by=null, rented_until=null,
                    stripe_subscription_id=null
  where rented_by = p_id;
  delete from leads      where installer_id = p_id;      -- cascades lead_delivery_log
  delete from rentals    where installer_id = p_id;
  delete from installers where id = p_id;
end $$;

revoke all on function hard_delete_asset(uuid)     from public;
revoke all on function hard_delete_installer(uuid) from public;
grant execute on function hard_delete_asset(uuid)     to authenticated;
grant execute on function hard_delete_installer(uuid) to authenticated;
