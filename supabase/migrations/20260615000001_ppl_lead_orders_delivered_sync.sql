-- Keep the client-facing ppl_lead_orders.delivered_count in step with the
-- admin-facing ppl_orders.delivered_leads.
--
-- The existing trigger (trg_ppl_order_delivered on public.leads) already calls
-- increment_ppl_order_delivered() whenever a lead's is_ppl flips true and bumps
-- ppl_orders.delivered_leads. Here we extend that same function to ALSO bump the
-- matching ppl_lead_orders row (the one the client dashboard reads).
--
-- The two updates are independent and guarded: if a company has no active
-- ppl_orders row, or no active ppl_lead_orders row, that part is skipped
-- silently so nothing breaks for clients whose order rows were never populated.
--
-- Only the function body changes — the trigger keeps pointing at it by name, so
-- no trigger recreation is needed.

create or replace function public.increment_ppl_order_delivered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id           uuid;
  v_total              int;
  v_new_delivered      int;
  v_lead_order_id      uuid;
  v_lead_quantity      int;
  v_new_lead_delivered int;
begin
  -- Only act when is_ppl transitions false → true (or NULL → true)
  if not (
    NEW.is_ppl = true and
    (TG_OP = 'INSERT' or coalesce(OLD.is_ppl, false) = false)
  ) then
    return NEW;
  end if;

  -- ── ppl_orders (admin fulfillment tracker) — behaviour unchanged ──────────
  select id, total_leads
  into v_order_id, v_total
  from public.ppl_orders
  where company_id = NEW.company_id
    and status = 'active'
  order by purchased_at asc
  limit 1;

  if v_order_id is not null then
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
  end if;

  -- ── ppl_lead_orders (client dashboard order) — NEW, independent + guarded ──
  -- If the company has no active ppl_lead_orders row with remaining capacity,
  -- this is skipped silently (handles clients whose row was never populated).
  select id, quantity
  into v_lead_order_id, v_lead_quantity
  from public.ppl_lead_orders
  where company_id = NEW.company_id
    and status = 'active'
    and delivered_count < quantity
  order by created_at asc
  limit 1;

  if v_lead_order_id is not null then
    update public.ppl_lead_orders
    set delivered_count = delivered_count + 1,
        updated_at      = now()
    where id = v_lead_order_id
    returning delivered_count into v_new_lead_delivered;

    -- Auto-mark fulfilled when the pack is fully delivered
    if v_new_lead_delivered >= v_lead_quantity then
      update public.ppl_lead_orders
      set status     = 'fulfilled',
          updated_at = now()
      where id = v_lead_order_id;
    end if;
  end if;

  return NEW;
end;
$$;
