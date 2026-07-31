-- Rush Delivery upsell for the solar 5-lead trial.
-- Stores checkout selection separately from the base trial and supports
-- fulfilment / refund tracking against the existing started_at clock.

alter table public.rental_checkouts
  add column if not exists rush_delivery boolean not null default false;

alter table public.rentals
  add column if not exists rush_delivery boolean not null default false,
  add column if not exists rush_delivery_checked_at timestamptz,
  add column if not exists rush_delivery_refund_flagged_at timestamptz;

create index if not exists rentals_rush_delivery_idx
  on public.rentals (started_at)
  where is_trial = true and rush_delivery = true and ended_at is null and rush_delivery_checked_at is null;
