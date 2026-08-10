-- area_pricing_overview was created without security_invoker, so it ran with the
-- view owner's rights and would have shown fleet pricing to any signed-in user
-- whose own RLS should not reach it. Flip it to run as the caller instead.
alter view public.area_pricing_overview set (security_invoker = true);

notify pgrst, 'reload schema';
