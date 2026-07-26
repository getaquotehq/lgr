-- =============================================================================
-- PPL Orders
-- =============================================================================
-- Tracks Pay-Per-Lead orders placed with Lead Gen Rentals. Each order records:
--   • total_leads  — the number of leads contracted in this order
--   • delivered_leads — auto-incremented by trigger whenever a lead with
--     is_ppl = true is inserted or flipped to PPL for this company
--   • purchased_at — when the order was created / purchased
--   • due_date     — the contracted delivery deadline
-- =============================================================================

-- ─── Table ────────────────────────────────────────────────────────────────────

create table public.ppl_orders (
  id              uuid        primary key default gen_random_uuid(),
  company_id      uuid        not null references public.companies(id) on delete cascade,
  total_leads     int         not null check (total_leads > 0),
  delivered_leads int         not null default 0 check (delivered_leads >= 0),
  purchased_at    timestamptz not null default now(),
  due_date        date        not null,
  status          text        not null default 'active'
                              check (status in ('active', 'completed', 'cancelled')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_ppl_orders_company on public.ppl_orders (company_id, purchased_at desc);
create index idx_ppl_orders_active  on public.ppl_orders (company_id, status) where status = 'active';

create trigger trg_ppl_orders_updated_at
  before update on public.ppl_orders
  for each row execute function public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.ppl_orders enable row level security;

create policy "ppl_orders_select"
  on public.ppl_orders for select
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

create policy "ppl_orders_insert"
  on public.ppl_orders for insert
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

-- Updates (cancel) are allowed by company members; completions are done by trigger
create policy "ppl_orders_update"
  on public.ppl_orders for update
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

-- ─── Trigger: auto-increment delivered_leads ──────────────────────────────────
-- Fires after INSERT or UPDATE on leads.
-- When is_ppl transitions to true (new lead or source updated to PPL),
-- find the oldest active order for the company and increment delivered_leads.
-- If that increment fills the order, mark it 'completed' automatically.

create or replace function public.increment_ppl_order_delivered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id      uuid;
  v_new_delivered int;
  v_total         int;
begin
  -- Only act when is_ppl transitions false → true (or NULL → true)
  if not (
    NEW.is_ppl = true and
    (TG_OP = 'INSERT' or coalesce(OLD.is_ppl, false) = false)
  ) then
    return NEW;
  end if;

  -- Pick the oldest active order with remaining capacity for this company
  select id, total_leads
  into v_order_id, v_total
  from public.ppl_orders
  where company_id = NEW.company_id
    and status = 'active'
  order by purchased_at asc
  limit 1;

  if v_order_id is null then
    return NEW; -- no active order, nothing to track
  end if;

  update public.ppl_orders
  set delivered_leads = delivered_leads + 1,
      updated_at      = now()
  where id = v_order_id
  returning delivered_leads into v_new_delivered;

  -- Auto-complete when fully delivered
  if v_new_delivered >= v_total then
    update public.ppl_orders
    set status     = 'completed',
        updated_at = now()
    where id = v_order_id;
  end if;

  return NEW;
end;
$$;

create trigger trg_ppl_order_delivered
  after insert or update of is_ppl on public.leads
  for each row execute function public.increment_ppl_order_delivered();

grant execute on function public.increment_ppl_order_delivered() to authenticated;
