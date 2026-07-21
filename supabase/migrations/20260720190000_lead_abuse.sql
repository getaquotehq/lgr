-- ============================================================================
-- Lead-abuse prevention: per-visitor submission cooldowns with escalating
-- penalties, plus a separate abuse log of blocked attempts.
--
-- Model
--   * Every successful submission stamps a 30-minute cooldown on the visitor.
--   * A visitor is identified by a persistent browser fingerprint + a device
--     hash + their IP. A match on ANY of the three counts as "the same visitor"
--     (so clearing one signal doesn't reset the clock).
--   * Submitting again while a cooldown is active is a VIOLATION → blocked and
--     logged, and the penalty escalates:
--         1st violation = 30 minutes
--         2nd violation = 24 hours
--         3rd+ violation = 7 days
--   * Enforcement is entirely server-side (these SECURITY DEFINER RPCs, called
--     by submit-lead with the service role). The client is never told which
--     signal tripped the block.
-- ============================================================================

-- Visitor state (one row per identity; carries the running violation count) ---
create table if not exists lead_abuse_visitors (
  id uuid primary key default gen_random_uuid(),
  fingerprint text,
  device_hash text,
  ip text,
  violation_count int not null default 0,
  cooldown_until timestamptz,
  last_submission_at timestamptz,
  first_seen_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists lead_abuse_visitors_fp_idx   on lead_abuse_visitors(fingerprint);
create index if not exists lead_abuse_visitors_dh_idx   on lead_abuse_visitors(device_hash);
create index if not exists lead_abuse_visitors_ip_idx   on lead_abuse_visitors(ip);
create index if not exists lead_abuse_visitors_cd_idx   on lead_abuse_visitors(cooldown_until);

-- Blocked-attempt log (append-only) ------------------------------------------
create table if not exists lead_abuse_log (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid references lead_abuse_visitors(id) on delete set null,
  fingerprint text,
  device_hash text,
  ip text,
  phone text,
  email text,
  postcode text,
  brand_domain text,
  user_agent text,
  violation_number int,
  penalty text,               -- '30 minutes' | '24 hours' | '7 days'
  cooldown_until timestamptz,
  created_at timestamptz default now()
);
create index if not exists lead_abuse_log_created_idx on lead_abuse_log(created_at desc);
create index if not exists lead_abuse_log_ip_idx      on lead_abuse_log(ip);

-- ----------------------------------------------------------------------------
-- enforce_lead_cooldown(): called at intake. If any signal is inside an active
-- cooldown, this is a violation — bump the count, apply the escalated penalty,
-- write an abuse-log row, and return {blocked:true}. Otherwise {blocked:false}.
-- Atomic (single statement path) so concurrent submits can't race the counter.
-- ----------------------------------------------------------------------------
create or replace function enforce_lead_cooldown(
  p_fingerprint text,
  p_device_hash text,
  p_ip text,
  p_phone text default null,
  p_email text default null,
  p_postcode text default null,
  p_brand_domain text default null,
  p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row      lead_abuse_visitors;
  v_count    int;
  v_penalty  interval;
  v_label    text;
  v_until    timestamptz;
begin
  select * into v_row
  from lead_abuse_visitors
  where cooldown_until is not null and cooldown_until > now()
    and (
      (p_fingerprint is not null and p_fingerprint <> '' and fingerprint = p_fingerprint)
      or (p_device_hash is not null and p_device_hash <> '' and device_hash = p_device_hash)
      or (p_ip is not null and p_ip <> '' and ip = p_ip)
    )
  order by cooldown_until desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('blocked', false);
  end if;

  v_count := v_row.violation_count + 1;
  if v_count >= 3 then
    v_penalty := interval '7 days';  v_label := '7 days';
  elsif v_count = 2 then
    v_penalty := interval '24 hours'; v_label := '24 hours';
  else
    v_penalty := interval '30 minutes'; v_label := '30 minutes';
  end if;
  v_until := now() + v_penalty;

  update lead_abuse_visitors set
    violation_count = v_count,
    cooldown_until  = v_until,
    fingerprint     = coalesce(fingerprint, nullif(p_fingerprint, '')),
    device_hash     = coalesce(device_hash, nullif(p_device_hash, '')),
    ip              = coalesce(nullif(p_ip, ''), ip),
    updated_at      = now()
  where id = v_row.id;

  insert into lead_abuse_log (
    visitor_id, fingerprint, device_hash, ip, phone, email, postcode,
    brand_domain, user_agent, violation_number, penalty, cooldown_until
  ) values (
    v_row.id, p_fingerprint, p_device_hash, p_ip, p_phone, p_email, p_postcode,
    p_brand_domain, p_user_agent, v_count, v_label, v_until
  );

  return jsonb_build_object('blocked', true, 'violation', v_count, 'cooldown_until', v_until);
end $$;

-- ----------------------------------------------------------------------------
-- record_lead_submission(): called after a genuine (human, non-spam) submission
-- is accepted. Stamps a fresh 30-minute cooldown on the visitor identity,
-- creating the row if it's new. Does NOT touch violation_count.
-- ----------------------------------------------------------------------------
create or replace function record_lead_submission(
  p_fingerprint text,
  p_device_hash text,
  p_ip text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from lead_abuse_visitors
  where (p_fingerprint is not null and p_fingerprint <> '' and fingerprint = p_fingerprint)
     or (p_device_hash is not null and p_device_hash <> '' and device_hash = p_device_hash)
     or (p_ip is not null and p_ip <> '' and ip = p_ip)
  order by updated_at desc
  limit 1;

  if v_id is null then
    insert into lead_abuse_visitors (fingerprint, device_hash, ip, cooldown_until, last_submission_at)
    values (nullif(p_fingerprint, ''), nullif(p_device_hash, ''), nullif(p_ip, ''),
            now() + interval '30 minutes', now());
  else
    update lead_abuse_visitors set
      cooldown_until     = now() + interval '30 minutes',
      last_submission_at = now(),
      fingerprint        = coalesce(fingerprint, nullif(p_fingerprint, '')),
      device_hash        = coalesce(device_hash, nullif(p_device_hash, '')),
      ip                 = coalesce(nullif(p_ip, ''), ip),
      updated_at         = now()
    where id = v_id;
  end if;
end $$;

-- Lock down: these are service-role only (submit-lead). Never anon/authenticated.
revoke all on function enforce_lead_cooldown(text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function record_lead_submission(text, text, text) from public, anon, authenticated;

-- Tables: admin (authenticated) may read the log/visitors in Mission Control;
-- the service role bypasses RLS to write. Anon never touches them.
alter table lead_abuse_visitors enable row level security;
alter table lead_abuse_log      enable row level security;
drop policy if exists "admin read abuse visitors" on lead_abuse_visitors;
drop policy if exists "admin read abuse log"      on lead_abuse_log;
create policy "admin read abuse visitors" on lead_abuse_visitors for select to authenticated using (true);
create policy "admin read abuse log"      on lead_abuse_log      for select to authenticated using (true);
grant select on lead_abuse_visitors, lead_abuse_log to authenticated;
