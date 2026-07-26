-- Allow company members to delete their own pending ppl_lead_orders (abandoned checkouts)
create policy "ppl_lead_orders_delete_pending"
  on ppl_lead_orders for delete
  using (
    status = 'pending'
    and company_id in (select company_id from profiles where id = auth.uid())
  );

-- Allow super admins to manually insert ppl_lead_orders (bypassing Stripe)
create policy "ppl_lead_orders_insert_admin"
  on ppl_lead_orders for insert
  with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
    and company_id in (select company_id from profiles where id = auth.uid())
  );

-- Allow super admins to update (cancel) ppl_lead_orders
create policy "ppl_lead_orders_update_admin"
  on ppl_lead_orders for update
  using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
    and company_id in (select company_id from profiles where id = auth.uid())
  )
  with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
    and company_id in (select company_id from profiles where id = auth.uid())
  );
