-- Ensure users can see their own company's ppl_lead_orders,
-- and admins can see all orders.
-- Recreating instead of IF NOT EXISTS because the policy may be missing
-- from live DB even though it exists in 002_full_build.sql.

drop policy if exists "Users can view own ppl orders" on public.ppl_lead_orders;
drop policy if exists "ppl_lead_orders_select_own"    on public.ppl_lead_orders;
drop policy if exists "ppl_lead_orders_select_admin"  on public.ppl_lead_orders;

-- Company members can see their own orders
create policy "ppl_lead_orders_select_own"
  on public.ppl_lead_orders for select
  using (
    company_id in (
      select company_id from public.profiles where id = auth.uid()
    )
  );

-- Super-admins can see all orders
create policy "ppl_lead_orders_select_admin"
  on public.ppl_lead_orders for select
  using (
    exists (
      select 1 from public.profiles where id = auth.uid() and is_admin = true
    )
  );
