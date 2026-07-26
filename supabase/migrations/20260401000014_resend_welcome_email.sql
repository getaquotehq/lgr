-- =============================================================================
-- Send welcome email via Resend when a new user signs up
-- =============================================================================
-- This uses a database webhook (pg_net) to call the resend-email edge function
-- when a new profile is created. The edge function sends a branded welcome
-- email via Resend.
--
-- NOTE: pg_net must be enabled in the Supabase dashboard for this to work.
-- The webhook fires after handle_new_user() creates the profile row.
-- =============================================================================

-- Create a function that sends a welcome email via the resend-email edge function
create or replace function public.send_welcome_email()
returns trigger
language plpgsql
security definer
as $$
declare
  v_user_email text;
  v_user_name  text;
  v_supabase_url text := current_setting('app.settings.supabase_url', true);
  v_service_key  text := current_setting('app.settings.service_role_key', true);
begin
  -- Get the user's email from auth.users
  select email into v_user_email
  from auth.users
  where id = new.id;

  -- Get the user's name
  v_user_name := coalesce(new.full_name, 'there');

  -- Only send welcome email to owners (new sign-ups), not invited members
  if new.role = 'owner' and v_user_email is not null then
    -- Use pg_net to call the resend-email edge function asynchronously
    -- This is non-blocking and won't slow down the sign-up process
    perform net.http_post(
      url := coalesce(v_supabase_url, '') || '/functions/v1/resend-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(v_service_key, '')
      ),
      body := jsonb_build_object(
        'to', v_user_email,
        'subject', 'Welcome to LeadGenRentalsHQ!',
        'html', '<html><body style="margin:0;padding:0;background:#f3f5f9;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f9;padding:40px 20px"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08)"><tr><td style="background:#1f6fff;padding:24px 32px"><h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600">LeadGenRentalsHQ</h1></td></tr><tr><td style="padding:32px"><h2 style="margin:0 0 16px;font-size:18px;color:#111827">Welcome to LeadGenRentalsHQ!</h2><p style="margin:0 0 8px;font-size:14px;color:#374151">Hi ' || v_user_name || ',</p><p style="margin:0 0 16px;font-size:14px;color:#374151">Your account has been created. You can now log in to manage your leads, quotes, and appointments with AI-powered automation.</p></td></tr><tr><td style="padding:16px 32px;background:#f8f9fb;border-top:1px solid #e5e7eb"><p style="margin:0;font-size:12px;color:#9ca3af;text-align:center">LeadGenRentalsHQ. All rights reserved.</p></td></tr></table></td></tr></table></body></html>'
      )
    );
  end if;

  return new;
exception
  when others then
    -- Never fail the trigger — email is best-effort
    raise warning 'send_welcome_email failed: %', sqlerrm;
    return new;
end;
$$;

-- Create trigger on profiles table (fires after handle_new_user creates the profile)
drop trigger if exists on_profile_created_welcome_email on public.profiles;
create trigger on_profile_created_welcome_email
  after insert on public.profiles
  for each row
  execute function public.send_welcome_email();
