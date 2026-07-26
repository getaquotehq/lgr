-- =============================================================================
-- LeadGenRentalsHQ — Migration 005: Quote Public Links & Auto-Call Setting
-- =============================================================================
-- Adds:
--   1. quote_token on quotes — unique token for public accept/decline links
--   2. Trigger to auto-generate quote_token on insert
--   3. auto_call_inbound on sms_agent_config — toggle AI auto-call for inbound leads
--   4. RLS policy allowing anonymous read of quotes by token (for public page)
-- =============================================================================

-- ─── Quote Token Column ─────────────────────────────────────────────────────
-- Unique, URL-safe token used for public quote links (view, accept, decline).

alter table public.quotes
  add column if not exists quote_token text unique;

-- Backfill existing quotes with a URL-safe token
update public.quotes
  set quote_token = replace(replace(encode(gen_random_bytes(24), 'base64'), '/', '_'), '+', '-')
  where quote_token is null;

-- Auto-generate token on insert
create or replace function public.generate_quote_token()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
begin
  if new.quote_token is null then
    new.quote_token := replace(replace(encode(gen_random_bytes(24), 'base64'), '/', '_'), '+', '-');
  end if;
  return new;
end;
$$;

create trigger set_quote_token
  before insert on public.quotes
  for each row
  execute function public.generate_quote_token();

-- ─── Public Access Policy ───────────────────────────────────────────────────
-- Allow the quote-public edge function (service role) to read/update quotes
-- by token. The edge function uses the service role key, so it bypasses RLS.
-- No additional RLS policy needed for service-role access.

-- ─── Auto-Call Inbound Setting ──────────────────────────────────────────────
-- When enabled, AI will automatically initiate a voice call to inbound leads.

alter table public.sms_agent_config
  add column if not exists auto_call_inbound boolean default false;
