-- ============================================================================
-- LGR sells solar and solar battery only. Hard-delete every other trade and
-- everything hanging off it: hvac, roofing, renovations.
--
-- Rather than hard-code the tables that point at an engine (several have been
-- renamed over time, e.g. leads -> asset_leads), this looks up every foreign
-- key that references public.assets and deletes the matching rows, then the
-- engines, then the niches.
--
-- One transaction: if anything still blocks a delete, the whole thing fails
-- and nothing is deleted.
-- ============================================================================
begin;

create temp table doomed_assets on commit drop as
  select a.id
    from public.assets a
    join public.niches n on n.id = a.niche_id
   where n.slug not in ('solar', 'battery');

do $$
declare fk record;
begin
  for fk in
    select c.conrelid::regclass as tbl, att.attname as col
      from pg_constraint c
      join pg_attribute att on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'public.assets'::regclass
       and c.conrelid <> 'public.assets'::regclass
       and array_length(c.conkey, 1) = 1
  loop
    execute format('delete from %s where %I in (select id from doomed_assets)', fk.tbl, fk.col);
  end loop;
end $$;

delete from public.assets where id in (select id from doomed_assets);
delete from public.niches where slug not in ('solar', 'battery');

commit;

notify pgrst, 'reload schema';
