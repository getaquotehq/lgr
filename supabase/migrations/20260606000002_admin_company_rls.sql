-- Allow super-admins to update any company directly (used by admin panel).
create policy "admins_update_any_company" on public.companies
  for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  )
  with check (true);
