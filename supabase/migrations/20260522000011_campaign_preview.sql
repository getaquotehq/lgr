-- Campaign preview workflow columns
-- campaign_status values:
--   'none'      = no assets generated yet
--   'preview'   = assets generated, awaiting client approval
--   'preparing' = client approved, team setting up live
--   'active'    = campaign running live
--   'paused'    = campaign paused

alter table public.companies
  add column if not exists creative_regeneration_count int default 0,
  add column if not exists creative_last_regenerated_at timestamptz;
