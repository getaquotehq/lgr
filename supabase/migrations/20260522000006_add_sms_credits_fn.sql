-- Atomically adds credits to a company's SMS balance (used by stripe-webhook top-up).
create or replace function public.add_sms_credits(p_company_id uuid, p_amount int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sms_credits (company_id, balance)
  values (p_company_id, p_amount)
  on conflict (company_id) do update
    set balance    = sms_credits.balance + excluded.balance,
        updated_at = now();
end;
$$;

grant execute on function public.add_sms_credits(uuid, int) to service_role;
