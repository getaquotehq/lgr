-- =============================================================================
-- Enable Supabase Realtime for conversations & messages
-- =============================================================================
-- Without this, the dashboard's postgres_changes subscription receives
-- nothing because the tables are not in the supabase_realtime publication.
--
-- REPLICA IDENTITY FULL is required so that UPDATE / DELETE payloads include
-- all columns (not just the PK), allowing client-side filters like
-- company_id matching to work on every event type.
-- =============================================================================

-- Add tables to the Realtime publication (idempotent — skip if already added)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Full replica identity so payload.new and payload.old always carry all columns
alter table public.conversations replica identity full;
alter table public.messages      replica identity full;
