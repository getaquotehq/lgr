-- Restrict PPL order creation to platform super-admins only.
-- Regular company members (owner/admin/member) can no longer INSERT.

drop policy if exists "ppl_orders_insert" on public.ppl_orders;

create policy "ppl_orders_insert"
  on public.ppl_orders for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and is_admin = true
    )
  );
