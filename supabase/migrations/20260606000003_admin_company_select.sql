-- Allow super-admins to read any company (needed for admin panel direct queries).
create policy "admins_select_any_company" on public.companies
  for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
