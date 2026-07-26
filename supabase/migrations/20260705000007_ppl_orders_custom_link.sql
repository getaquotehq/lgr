-- Mark PPL orders created via the admin Custom Payment Link generator, and
-- store the generated checkout URL, so /admin can list recent custom links
-- and their payment status. Additive + nullable — existing orders unaffected.

alter table public.ppl_lead_orders
  add column if not exists custom_link  boolean default false;

alter table public.ppl_lead_orders
  add column if not exists checkout_url text;
