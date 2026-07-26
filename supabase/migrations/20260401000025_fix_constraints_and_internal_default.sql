-- =============================================================================
-- Fix ON CONFLICT errors & default new signups to 'internal' user_type
-- =============================================================================
-- 1. Idempotently ensure UNIQUE constraint on sms_agent_config.company_id
--    so upsert ON CONFLICT (company_id) works.
-- 2. Update handle_new_user() trigger to:
--    a) Default user_type to 'internal' for new signups
--    b) Base role on whether a new company was created (signup → owner)
--       rather than on user_type, so 'internal' signups are still owners.
-- =============================================================================

-- ── 1a. Ensure sms_agent_config has UNIQUE on company_id ────────────────────
do $$
begin
  -- Remove duplicates (keep most-recently-updated row per company)
  delete from public.sms_agent_config
  where id not in (
    select distinct on (company_id) id
    from public.sms_agent_config
    order by company_id, updated_at desc nulls last, created_at desc nulls last
  );

  if not exists (
    select 1 from pg_constraint
    where conname = 'sms_agent_config_company_id_key'
  ) then
    alter table public.sms_agent_config
      add constraint sms_agent_config_company_id_key unique (company_id);
  end if;
end $$;

-- ── 2. Update handle_new_user() trigger ─────────────────────────────────────
--    • Default user_type → 'internal' (was 'external')
--    • Role is now based on whether the user created a new company (signup)
--      or was invited to an existing one (invite-rep provides company_id).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_company_id          uuid;
  v_provided_company_id uuid;
  v_user_type           public.user_type := 'internal';
  v_full_name           text;
begin
  -- Pull metadata supplied at signup / invite
  v_full_name           := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  v_user_type           := coalesce(
                             (new.raw_user_meta_data ->> 'user_type')::public.user_type,
                             'internal'
                           );
  v_provided_company_id := (new.raw_user_meta_data ->> 'company_id')::uuid;
  v_company_id          := v_provided_company_id;

  -- If no company_id was supplied, create a new company for this user
  if v_company_id is null then
    insert into public.companies (name, slug)
    values (
      coalesce(new.raw_user_meta_data ->> 'company_name', v_full_name || '''s Company'),
      'co-' || substr(new.id::text, 1, 8)
    )
    returning id into v_company_id;
  end if;

  insert into public.profiles (id, company_id, user_type, full_name, role)
  values (
    new.id,
    v_company_id,
    v_user_type,
    v_full_name,
    -- Signup (no company_id provided → new company created) → owner
    -- Invite  (company_id provided)                         → member
    case when v_provided_company_id is null then 'owner' else 'member' end
  );

  return new;
end;
$$;
