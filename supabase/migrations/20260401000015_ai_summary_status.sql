-- ============================================================================
-- Migration 015 — AI Summary & Status on Leads
-- Adds ai_summary and ai_status columns so AI can store a rolling conversation
-- summary and a heat label (hot / warm / cold / new) after each goal event.
-- ai_score and ai_score_reason already exist from migration 003.
-- ============================================================================

-- ai_summary: free-text AI-generated overview of the conversation so far
alter table public.leads
  add column if not exists ai_summary text;

-- ai_status: derived heat label — hot / warm / cold / new
alter table public.leads
  add column if not exists ai_status text default 'new';
