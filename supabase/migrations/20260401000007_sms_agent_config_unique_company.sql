-- Fix: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- The dashboard upserts sms_agent_config with onConflict: "company_id",
-- but no UNIQUE constraint existed on that column.

-- 1. Remove any duplicate rows per company_id, keeping the most recently updated one.
delete from public.sms_agent_config
where id not in (
  select distinct on (company_id) id
  from public.sms_agent_config
  order by company_id, updated_at desc nulls last, created_at desc nulls last
);

-- 2. Add the unique constraint so upsert ON CONFLICT (company_id) works.
alter table public.sms_agent_config
  add constraint sms_agent_config_company_id_key unique (company_id);
