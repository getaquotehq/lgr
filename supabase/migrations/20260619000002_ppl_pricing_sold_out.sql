-- Mark a pricing row (a niche default, or a specific niche+area) as SOLD OUT.
-- The buy-leads page reads this via get-ppl-pricing and, when true, shows a
-- "sold out in your area" message for that trade instead of a price + checkout.
alter table public.ppl_pricing
  add column if not exists sold_out boolean not null default false;
