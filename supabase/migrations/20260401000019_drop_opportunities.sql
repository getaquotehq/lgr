-- =============================================================================
-- LeadGenRentalsHQ — Migration 019: Drop unused opportunities table
-- =============================================================================
-- The opportunities table was never used by the application. The Kanban board
-- and pipeline features work directly on the leads table. This migration
-- removes the opportunities table and all dependent objects.
-- =============================================================================

-- ─── Drop the pipeline_board view (depends on opportunities) ─────────────────
drop view if exists public.pipeline_board;

-- ─── Drop triggers & functions for opportunity ↔ lead sync ───────────────────
drop trigger if exists sync_opportunity_stage on public.opportunities;
drop function if exists public.sync_opportunity_pipeline_stage();

-- The sync_lead_stage trigger syncs lead pipeline changes to opportunities —
-- since the opportunities table is being dropped, this trigger is no longer needed.
drop trigger if exists sync_lead_stage on public.leads;
drop function if exists public.sync_lead_pipeline_stage();

-- ─── Drop opportunity_id foreign keys from related tables ────────────────────
alter table public.quotes drop column if exists opportunity_id;
alter table public.appointments drop column if exists opportunity_id;
alter table public.sales drop column if exists opportunity_id;
-- quote_drafts may exist in some environments with an opportunity_id FK
alter table if exists public.quote_drafts drop column if exists opportunity_id;

-- ─── Drop opportunities_visibility from sales_reps ───────────────────────────
alter table public.sales_reps drop column if exists opportunities_visibility;

-- ─── Drop the opportunities table ────────────────────────────────────────────
drop table if exists public.opportunities;
