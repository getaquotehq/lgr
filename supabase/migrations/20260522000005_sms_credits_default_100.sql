-- Change starting SMS credit balance from 0 to 100 for all new companies.
create or replace function public.provision_sms_for_company()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  insert into public.sms_credits (company_id, balance)
  values (new.id, 100)
  on conflict (company_id) do nothing;

  insert into public.sms_agent_config (company_id, name, auto_reply, is_active, lead_scoring_enabled)
  values (new.id, 'Default SMS Agent', false, false, false)
  on conflict do nothing;

  return new;
end;
$$;
