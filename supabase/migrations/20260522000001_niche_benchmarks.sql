-- Stores pre-aggregated cross-company benchmarks per niche.
-- Individual company data NEVER appears here — only statistical aggregates.
-- Readable by any authenticated user; writable only by service role or the
-- refresh function (SECURITY DEFINER).
create table if not exists public.niche_benchmarks (
  niche                text primary key,
  company_count        int  not null default 0,
  avg_ai_coverage      decimal(5,2),   -- % leads handled by AI
  avg_callback_rate    decimal(5,2),   -- % AI-handled leads that booked callback
  p25_callback_rate    decimal(5,2),
  p75_callback_rate    decimal(5,2),
  avg_win_rate         decimal(5,2),   -- % closed leads that were won
  p25_win_rate         decimal(5,2),
  p75_win_rate         decimal(5,2),
  avg_lead_score       decimal(5,1),   -- avg AI quality score /100
  avg_deal_value       decimal(10,2),  -- avg value of closed_won leads
  updated_at           timestamptz default now()
);

alter table public.niche_benchmarks enable row level security;

-- Any authenticated user can read aggregate benchmarks
create policy "niche_benchmarks_read"
  on public.niche_benchmarks for select
  using (auth.role() = 'authenticated');

-- Only service role can write directly
create policy "niche_benchmarks_service"
  on public.niche_benchmarks for all
  using (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- refresh_niche_benchmarks()
--
-- Aggregates cross-company stats from ai_performance_stats + leads.
-- Only companies with >= 5 leads contribute. Only niches with >= 10
-- contributing companies are written to niche_benchmarks.
-- Self-throttles: skips if last refresh was less than 6 hours ago.
-- SECURITY DEFINER so it can read across RLS boundaries for aggregation.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.refresh_niche_benchmarks()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  last_update timestamptz;
begin
  select max(updated_at) into last_update from niche_benchmarks;

  -- Throttle: skip if refreshed within the last 6 hours
  if last_update is not null and last_update > now() - interval '6 hours' then
    return;
  end if;

  insert into niche_benchmarks (
    niche,
    company_count,
    avg_ai_coverage,
    avg_callback_rate,
    p25_callback_rate,
    p75_callback_rate,
    avg_win_rate,
    p25_win_rate,
    p75_win_rate,
    avg_lead_score,
    avg_deal_value,
    updated_at
  )
  select
    niche_co.niche,
    count(distinct aps.company_id)::int,

    -- AI coverage: % of total leads handled by AI
    round(avg(
      case when aps.total_leads > 0
        then 100.0 * aps.ai_handled_leads / aps.total_leads
        else null end
    )::numeric, 2),

    -- Callback rate: % of AI-handled leads that booked
    round(avg(aps.ai_conversion_rate)::numeric, 2),
    round(percentile_cont(0.25) within group (order by aps.ai_conversion_rate)::numeric, 2),
    round(percentile_cont(0.75) within group (order by aps.ai_conversion_rate)::numeric, 2),

    -- Win rate: % of closed leads that were won (from leads table)
    round(avg(w.win_rate)::numeric, 2),
    round(percentile_cont(0.25) within group (order by w.win_rate)::numeric, 2),
    round(percentile_cont(0.75) within group (order by w.win_rate)::numeric, 2),

    -- Avg AI lead quality score
    round(avg(aps.avg_ai_score)::numeric, 1),

    -- Avg deal value from closed_won leads with a value set
    round(avg(d.avg_deal)::numeric, 2),

    now()

  from ai_performance_stats aps

  -- Restrict to companies that have a paid/active order in this niche
  join (
    select distinct company_id, niche
    from ppl_lead_orders
    where status in ('paid', 'active', 'fulfilled')
  ) niche_co on niche_co.company_id = aps.company_id

  -- Win rate per company
  left join lateral (
    select
      company_id,
      case
        when count(*) filter (where pipeline_stage in ('closed_won','closed_lost')) > 0
          then 100.0
            * count(*) filter (where pipeline_stage = 'closed_won')
            / count(*) filter (where pipeline_stage in ('closed_won','closed_lost'))
        else null
      end as win_rate
    from leads
    where company_id = aps.company_id
    group by company_id
  ) w on true

  -- Avg deal value per company
  left join lateral (
    select company_id, avg(value) as avg_deal
    from leads
    where company_id = aps.company_id
      and pipeline_stage = 'closed_won'
      and value > 0
    group by company_id
  ) d on true

  -- Only include companies that have opted in to AI data sharing
  join companies co on co.id = aps.company_id
    and (co.settings->>'allow_ai_training')::boolean = true

  where aps.period = 'all_time'
    and aps.total_leads >= 5   -- company must have meaningful data to contribute

  group by niche_co.niche
  having count(distinct aps.company_id) >= 10  -- only publish when 10+ companies

  on conflict (niche) do update set
    company_count     = excluded.company_count,
    avg_ai_coverage   = excluded.avg_ai_coverage,
    avg_callback_rate = excluded.avg_callback_rate,
    p25_callback_rate = excluded.p25_callback_rate,
    p75_callback_rate = excluded.p75_callback_rate,
    avg_win_rate      = excluded.avg_win_rate,
    p25_win_rate      = excluded.p25_win_rate,
    p75_win_rate      = excluded.p75_win_rate,
    avg_lead_score    = excluded.avg_lead_score,
    avg_deal_value    = excluded.avg_deal_value,
    updated_at        = excluded.updated_at;
end;
$$;

-- Grant execute to authenticated users (throttle prevents abuse)
grant execute on function public.refresh_niche_benchmarks() to authenticated;
