-- =============================================================================
-- AI Learning System — Company Knowledge Base & Performance Analytics
-- =============================================================================
-- Creates the tables and views needed for the AI data moat:
--   1. company_knowledge — Accumulated AI learnings per company
--   2. ai_performance_stats — Materialized metrics for AI analytics dashboard
-- =============================================================================

-- ── 1. Company Knowledge Base ────────────────────────────────────────────────
-- Stores structured learnings extracted from completed interactions.
-- Each row represents one insight that gets injected into future AI prompts.
create table if not exists public.company_knowledge (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  -- Category of learning
  category      text not null check (category in (
    'winning_pattern',     -- what worked in closed_won conversations
    'failed_pattern',      -- what went wrong in closed_lost conversations
    'objection_response',  -- effective objection handling
    'scheduling_approach', -- successful appointment scheduling language
    'quote_approach',      -- effective quote presentation
    'service_insight',     -- service-specific customer questions/preferences
    'style_preference'     -- tone, length, formality that works best
  )),
  -- The actual learning / insight text (injected into prompts)
  insight       text not null,
  -- Relevance tags for matching (e.g., service type, objection type)
  tags          text[] not null default '{}',
  -- Source tracking
  source_type   text not null check (source_type in ('sms', 'quote', 'mixed')),
  source_lead_id uuid references public.leads(id) on delete set null,
  -- Effectiveness tracking
  times_used    int not null default 0,
  effectiveness_score numeric(3,2) default null, -- 0.00-1.00, updated over time
  -- Metadata
  metadata      jsonb not null default '{}',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Indexes for fast retrieval during prompt building
create index if not exists idx_company_knowledge_company
  on public.company_knowledge(company_id, is_active, category);
create index if not exists idx_company_knowledge_tags
  on public.company_knowledge using gin(tags);
create index if not exists idx_company_knowledge_created
  on public.company_knowledge(company_id, created_at desc);

-- RLS
alter table public.company_knowledge enable row level security;

create policy "company_knowledge_select"
  on public.company_knowledge for select
  using (company_id in (
    select company_id from public.profiles where id = auth.uid()
  ));

create policy "company_knowledge_service_role"
  on public.company_knowledge for all
  using (true)
  with check (true);

-- Grant service role full access (edge functions use service role)
-- The service_role policy above handles this via RLS bypass

-- ── 2. AI Performance Stats ─────────────────────────────────────────────────
-- Snapshot table for pre-computed analytics (updated by ai-learner function)
create table if not exists public.ai_performance_stats (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  period          text not null check (period in ('daily', 'weekly', 'monthly', 'all_time')),
  period_start    date not null,
  -- Lead metrics
  total_leads           int not null default 0,
  ai_handled_leads      int not null default 0,
  human_handled_leads   int not null default 0,
  -- Conversion metrics
  ai_conversions        int not null default 0,
  human_conversions     int not null default 0,
  ai_conversion_rate    numeric(5,2) default 0,
  human_conversion_rate numeric(5,2) default 0,
  -- Score metrics
  avg_ai_score          numeric(5,2) default 0,
  avg_score_improvement numeric(5,2) default 0,
  -- Action effectiveness
  callbacks_booked      int not null default 0,
  onsites_booked        int not null default 0,
  quotes_generated      int not null default 0,
  -- Knowledge metrics
  knowledge_items_count int not null default 0,
  -- Timestamps
  computed_at           timestamptz not null default now(),

  unique(company_id, period, period_start)
);

create index if not exists idx_ai_perf_stats_company
  on public.ai_performance_stats(company_id, period, period_start desc);

-- RLS
alter table public.ai_performance_stats enable row level security;

create policy "ai_perf_stats_select"
  on public.ai_performance_stats for select
  using (company_id in (
    select company_id from public.profiles where id = auth.uid()
  ));

create policy "ai_perf_stats_service_role"
  on public.ai_performance_stats for all
  using (true)
  with check (true);

-- ── 3. Industry Insights (Cross-Company Anonymized) ─────────────────────────
-- Aggregated, anonymized insights across all companies for network effects.
-- No company-specific data is stored — only statistical patterns.
create table if not exists public.industry_insights (
  id              uuid primary key default gen_random_uuid(),
  -- Industry/service category (e.g., "plumbing", "electrical", "roofing")
  industry        text not null,
  -- The aggregated insight
  insight         text not null,
  -- Statistical backing
  sample_size     int not null default 0,
  confidence      numeric(3,2) not null default 0, -- 0.00-1.00
  -- Metadata
  tags            text[] not null default '{}',
  metadata        jsonb not null default '{}',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_industry_insights_industry
  on public.industry_insights(industry, is_active);

-- RLS: all authenticated users can read industry insights (they're anonymized)
alter table public.industry_insights enable row level security;

create policy "industry_insights_select"
  on public.industry_insights for select
  using (auth.role() = 'authenticated');

create policy "industry_insights_service_role"
  on public.industry_insights for all
  using (true)
  with check (true);
