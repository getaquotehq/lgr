-- =============================================================================
-- PPL Call Attempt Logging
-- =============================================================================
-- Tracks call attempts made on PPL leads. Used by the dispute system to:
--   • Enforce the 7-day dispute window (from lead delivery / created_at)
--   • Enforce the 24-hour call rule — if no attempt is logged within 24h of
--     delivery, the 'invalid_number' dispute reason becomes unavailable and
--     eligibility drops to 'duplicate' and 'outside_agreed_criteria' only.
-- =============================================================================

create type public.call_outcome as enum (
  'no_answer',
  'voicemail',
  'connected',
  'wrong_number',
  'callback_requested'
);

create table public.ppl_call_attempts (
  id           uuid        primary key default gen_random_uuid(),
  lead_id      uuid        not null references public.leads(id) on delete cascade,
  company_id   uuid        not null references public.companies(id) on delete cascade,
  logged_by    uuid        references auth.users(id) on delete set null,
  outcome      public.call_outcome not null,
  notes        text,
  -- When the call was actually attempted (user may log it after the fact,
  -- but defaults to now so the 24h window is calculated correctly).
  attempted_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index idx_ppl_call_attempts_lead
  on public.ppl_call_attempts (lead_id, attempted_at);

create index idx_ppl_call_attempts_company
  on public.ppl_call_attempts (company_id, created_at desc);

alter table public.ppl_call_attempts enable row level security;

create policy "ppl_call_attempts_select"
  on public.ppl_call_attempts for select
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

-- Only allow logging calls against PPL leads owned by the user's company.
create policy "ppl_call_attempts_insert"
  on public.ppl_call_attempts for insert
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and exists (
      select 1 from public.leads
      where id = lead_id
        and is_ppl = true
        and company_id = ppl_call_attempts.company_id
    )
  );

-- ─── Helper: PPL dispute eligibility ─────────────────────────────────────────
-- Returns a JSON object used by the edge function and client to determine
-- which dispute reasons are available for a given lead.
--
-- Rules enforced:
--   dispute_window_open  — lead.created_at must be within 7 days
--   call_within_24h      — at least one attempt logged within 24h of delivery
--   eligible_reasons     — array of reasons currently available

create or replace function public.get_ppl_dispute_eligibility(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead          record;
  v_delivery      timestamptz;
  v_now           timestamptz := now();
  v_days_since    numeric;
  v_window_open   boolean;
  v_call_24h      boolean;
  v_reasons       text[];
  v_days_left     numeric;
begin
  select id, company_id, is_ppl, created_at
  into v_lead
  from public.leads
  where id = p_lead_id;

  if not found then
    return jsonb_build_object('error', 'Lead not found');
  end if;

  if not v_lead.is_ppl then
    return jsonb_build_object('error', 'Not a PPL lead');
  end if;

  v_delivery   := v_lead.created_at;
  v_days_since := extract(epoch from (v_now - v_delivery)) / 86400.0;
  v_window_open := v_days_since <= 7;
  v_days_left   := greatest(0, round((7 - v_days_since)::numeric, 1));

  -- Was any call attempt logged within the first 24 hours of delivery?
  select exists (
    select 1 from public.ppl_call_attempts
    where lead_id = p_lead_id
      and attempted_at >= v_delivery
      and attempted_at <  v_delivery + interval '24 hours'
  ) into v_call_24h;

  -- Build the eligible reason list
  if v_window_open then
    v_reasons := array['duplicate', 'outside_agreed_criteria'];
    if v_call_24h then
      v_reasons := array['invalid_number', 'duplicate', 'outside_agreed_criteria'];
    end if;
  else
    v_reasons := array[]::text[];
  end if;

  return jsonb_build_object(
    'dispute_window_open',  v_window_open,
    'days_since_delivery',  round(v_days_since::numeric, 1),
    'days_remaining',       v_days_left,
    'call_within_24h',      v_call_24h,
    'eligible_reasons',     to_jsonb(v_reasons),
    'delivery_at',          v_delivery
  );
end;
$$;

grant execute on function public.get_ppl_dispute_eligibility(uuid) to authenticated;
