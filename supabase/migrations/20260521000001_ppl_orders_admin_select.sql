-- Allow super-admins to read all PPL orders (not just their own company's)
create policy "ppl_orders_superadmin_select"
  on public.ppl_orders for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and is_admin = true
    )
  );
