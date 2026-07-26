-- Rolling 30-day free SMS credits (500 per billing cycle, tied to sign-up / payment date)
-- Each company gets their own next_reset_at timestamp (rolling 30-day window).
-- Cron runs daily and tops up any company whose window has expired.

alter table public.sms_credits
  add column if not exists monthly_free_sms int not null default 500,
  add column if not exists next_reset_at    timestamptz;

-- Provision trigger: 500 credits immediately, next reset in 30 days.
create or replace function public.provision_sms_for_company()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  insert into public.sms_credits (company_id, balance, monthly_free_sms, next_reset_at)
  values (new.id, 500, 500, now() + interval '30 days')
  on conflict (company_id) do nothing;

  insert into public.sms_agent_config (company_id, name, auto_reply, is_active, lead_scoring_enabled)
  values (new.id, 'Default SMS Agent', false, false, false)
  on conflict do nothing;

  return new;
end;
$$;

-- Function: top up any company whose 30-day window has expired.
-- Rolling: next_reset_at advances by 30 days each time (preserves billing cadence).
-- Idempotent: safe to call multiple times per day.
create or replace function public.reset_monthly_sms_credits()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sms_credits
    set balance      = balance + monthly_free_sms,
        next_reset_at = next_reset_at + interval '30 days',
        updated_at   = now()
  where next_reset_at is not null
    and next_reset_at <= now();
end;
$$;

grant execute on function public.reset_monthly_sms_credits() to service_role;

-- Daily cron at 1 AM UTC to top up companies whose window expired overnight.
-- Requires pg_cron extension (enable in Supabase Dashboard → Extensions).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Remove old monthly schedule if it exists
    perform cron.unschedule('monthly-sms-credits');
  exception when others then null;
  end if;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'daily-sms-credit-reset',
      '0 1 * * *',
      'SELECT public.reset_monthly_sms_credits()'
    );
  end if;
end;
$$;

-- Backfill existing companies: give 500 top-up and set next_reset_at = 30 days from now.
-- Only runs on rows that have never had a reset date (pre-migration companies).
update public.sms_credits
  set balance       = balance + 500,
      monthly_free_sms = 500,
      next_reset_at = now() + interval '30 days',
      updated_at    = now()
where next_reset_at is null;
