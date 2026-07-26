-- Fix: saving a lead with no source failed with
--   "null value in column \"is_ppl\" of relation \"leads\" violates not-null constraint".
--
-- The sync_is_ppl_from_source() trigger fires BEFORE INSERT on every lead and
-- assigns:
--     NEW.is_ppl := lower(NEW.source) in ('ppl', 'leadgenrentals ppl');
-- When source is NULL, SQL three-valued logic makes `NULL in (...)` evaluate to
-- NULL (not false). That NULL overrode the column's `default false` and tripped
-- the NOT NULL constraint on is_ppl, so every lead saved without a source
-- (the common case from the dashboard) failed to insert.
--
-- Wrap the comparison in coalesce(..., false) so a missing/blank source is
-- treated as "not PPL".

create or replace function public.sync_is_ppl_from_source()
returns trigger
language plpgsql
as $$
begin
  NEW.is_ppl := coalesce(lower(NEW.source) in ('ppl', 'leadgenrentals ppl'), false);
  return NEW;
end;
$$;
