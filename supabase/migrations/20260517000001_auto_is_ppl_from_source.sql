-- Automatically set is_ppl = true whenever a lead is created or updated
-- with source = 'PPL' (case-insensitive). Covers all insertion paths:
-- dashboard UI, external API, CSV import, and any future integrations.

create or replace function public.sync_is_ppl_from_source()
returns trigger
language plpgsql
as $$
begin
  NEW.is_ppl := lower(NEW.source) = 'ppl';
  return NEW;
end;
$$;

drop trigger if exists trg_sync_is_ppl_from_source on public.leads;

create trigger trg_sync_is_ppl_from_source
  before insert or update of source on public.leads
  for each row
  execute function public.sync_is_ppl_from_source();

-- Backfill any existing leads where source = 'PPL' but is_ppl is still false
update public.leads
set is_ppl = true
where lower(source) = 'ppl' and is_ppl = false;
