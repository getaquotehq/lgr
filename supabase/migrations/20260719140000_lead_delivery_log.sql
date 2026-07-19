-- ============================================================================
-- lead_delivery_log — mirrors ql-mc's delivery-log so the admin's Lead
-- Distribution panel can show what happened to each captured lead.
--
-- Today, real delivery (SMS / email / CRM push) is still the pg_notify stub in
-- insert_lead(). This trigger records one honest row per captured lead so the
-- log is populated now; when the real delivery Edge Function is built it can
-- write richer rows (sent/failed, provider ids, http codes, etc.).
-- ============================================================================

create table if not exists lead_delivery_log (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade not null,
  installer_id uuid references installers(id) on delete set null,
  channel text not null default 'pg_notify',   -- sms | email | webhook | pg_notify
  status text not null default 'queued',        -- queued | sent | failed | skipped
  detail text,
  created_at timestamptz default now()
);
create index if not exists lead_delivery_log_lead_idx on lead_delivery_log(lead_id);
create index if not exists lead_delivery_log_created_idx on lead_delivery_log(created_at desc);

-- Log a row whenever a lead is captured.
create or replace function log_lead_delivery() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into lead_delivery_log (lead_id, installer_id, channel, status, detail)
  values (
    new.id, new.installer_id, 'pg_notify',
    case when new.status = 'delivered' then 'queued' else 'skipped' end,
    case when new.status = 'delivered' then 'lead_delivered notification emitted'
         when new.status = 'duplicate' then 'duplicate — did not count toward floor'
         else 'invalid — not delivered' end
  );
  return new;
end $$;

drop trigger if exists trg_log_lead_delivery on leads;
create trigger trg_log_lead_delivery after insert on leads
  for each row execute function log_lead_delivery();

-- RLS: admin (authenticated) full access; anon never touches it.
alter table lead_delivery_log enable row level security;
drop policy if exists "admin all lead_delivery_log" on lead_delivery_log;
create policy "admin all lead_delivery_log" on lead_delivery_log
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on lead_delivery_log to authenticated;

-- Backfill a log row for any leads that already exist.
insert into lead_delivery_log (lead_id, installer_id, channel, status, detail, created_at)
select l.id, l.installer_id, 'pg_notify',
       case when l.status='delivered' then 'queued' else 'skipped' end,
       case when l.status='delivered' then 'lead_delivered notification emitted'
            when l.status='duplicate' then 'duplicate — did not count toward floor'
            else 'invalid — not delivered' end,
       l.captured_at
from leads l
where not exists (select 1 from lead_delivery_log d where d.lead_id = l.id);
