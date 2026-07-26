-- Cap the number of leads that can be bought in a single order for a given
-- niche/area. NULL means unlimited (subject to the app's hard ceiling of 500);
-- a number caps that niche/area to at most that many leads per order.
-- The buy-leads page and the ql-hq dashboard read this via get-ppl-pricing and
-- clamp the quantity selector / disable over-cap packs accordingly. The checkout
-- functions also re-check it server-side.
alter table public.ppl_pricing
  add column if not exists max_order_qty integer;

comment on column public.ppl_pricing.max_order_qty is
  'Max leads purchasable in a single order for this niche/area. NULL = unlimited (up to the app ceiling of 500).';
