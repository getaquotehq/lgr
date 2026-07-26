-- Preserve a company's PPL service-area history so an "outside_agreed_criteria"
-- dispute is judged against the area that was in effect WHEN THE LEAD WAS
-- DELIVERED, not the company's current area. Without this, a client who was
-- delivered an in-area lead, then later changed their service areas, could
-- dispute that old lead as out-of-area (it would auto-approve wrongly). Areas
-- are written from many places (dashboard, admin, stripe-webhook, sync-from-mc,
-- impersonation), so we capture every change with a trigger on companies rather
-- than intercepting each call site.

-- ── History table ────────────────────────────────────────────────────────────
create table if not exists public.ppl_area_history (
  id             uuid        primary key default gen_random_uuid(),
  company_id     uuid        not null references public.companies(id) on delete cascade,
  postcodes      text[]      not null default '{}',
  effective_from timestamptz not null default now(),
  effective_to   timestamptz,                          -- null = still current
  created_at     timestamptz not null default now()
);

create index if not exists idx_ppl_area_history_company
  on public.ppl_area_history (company_id, effective_from desc);

-- Only ever read via the SECURITY DEFINER helper / written via the trigger;
-- expose read access to super-admins for auditing.
alter table public.ppl_area_history enable row level security;

drop policy if exists "pah_admin_select" on public.ppl_area_history;
create policy "pah_admin_select" on public.ppl_area_history
  for select using (public.is_super_admin());

-- ── Backfill: seed each company's current area as an open period ──────────────
-- effective_from = the company's creation time so every existing lead is
-- covered by the area as it stands today (i.e. no behaviour change for existing
-- leads); change tracking begins from here on.
insert into public.ppl_area_history (company_id, postcodes, effective_from)
select id, ppl_agreed_postcodes, coalesce(created_at, '1970-01-01'::timestamptz)
from public.companies
where ppl_agreed_postcodes is not null
  and array_length(ppl_agreed_postcodes, 1) > 0
  and not exists (
    select 1 from public.ppl_area_history h where h.company_id = companies.id
  );

-- ── Trigger: record every service-area change ────────────────────────────────
create or replace function public.record_ppl_area_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.ppl_agreed_postcodes is not null
       and array_length(new.ppl_agreed_postcodes, 1) > 0 then
      insert into public.ppl_area_history (company_id, postcodes, effective_from)
      values (new.id, new.ppl_agreed_postcodes, coalesce(new.created_at, now()));
    end if;

  elsif tg_op = 'UPDATE' then
    if new.ppl_agreed_postcodes is distinct from old.ppl_agreed_postcodes then
      -- close whatever period is currently open
      update public.ppl_area_history
        set effective_to = now()
        where company_id = new.id and effective_to is null;
      -- open a new period for the new set (skip if they cleared it)
      if new.ppl_agreed_postcodes is not null
         and array_length(new.ppl_agreed_postcodes, 1) > 0 then
        insert into public.ppl_area_history (company_id, postcodes, effective_from)
        values (new.id, new.ppl_agreed_postcodes, now());
      end if;
    end if;
  end if;

  return new;
exception when others then
  -- Never let history logging block a company write.
  raise warning 'record_ppl_area_change failed for company %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_company_ppl_area_change on public.companies;
create trigger on_company_ppl_area_change
  after insert or update of ppl_agreed_postcodes on public.companies
  for each row
  execute function public.record_ppl_area_change();

-- ── Point-in-time lookup ─────────────────────────────────────────────────────
-- Returns the agreed postcodes that were in effect at p_at, falling back to the
-- company's current set when there is no history row covering that moment.
create or replace function public.ppl_agreed_postcodes_at(
  p_company_id uuid,
  p_at         timestamptz
)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select postcodes
      from public.ppl_area_history
      where company_id = p_company_id
        and effective_from <= p_at
        and (effective_to is null or effective_to > p_at)
      order by effective_from desc
      limit 1
    ),
    (select ppl_agreed_postcodes from public.companies where id = p_company_id),
    '{}'::text[]
  );
$$;
