-- =============================================================================
-- Disable welcome email on user sign-up
-- =============================================================================
-- The owner wants to re-enable this later. For now, drop the trigger so no
-- email is sent when a new profile row is created during sign-up.
-- The function is kept so it can be easily re-attached later.
-- =============================================================================

drop trigger if exists on_profile_created_welcome_email on public.profiles;
