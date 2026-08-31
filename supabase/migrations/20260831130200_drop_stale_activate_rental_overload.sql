-- ============================================================================
-- Drop the dead 8-argument activate_rental overload.
--
-- Two overloads existed: the original 8-arg one, and a 9-arg one adding
-- p_is_trial (default false) from 20260731044000_rush_delivery_trial_addon.
-- Because the ninth argument has a default, any 8-argument positional call
-- matches both and Postgres refuses it as ambiguous. Found while verifying that
-- the revoke in 20260831130000 actually stops an authenticated caller - the
-- test call failed on ambiguity rather than on permissions, which would have
-- hidden the result either way.
--
-- The money path is unaffected. stripe-webhook is the only caller anywhere in
-- the codebase and it calls through PostgREST with nine NAMED arguments, which
-- resolves to the 9-arg version exactly. The 8-arg version could only ever
-- produce an ambiguity error, so it goes.
--
-- Re-verified after applying, as `authenticated`:
--   select public.activate_rental(...8 args...);
--   ERROR: 42501 permission denied for function activate_rental
-- which is the intended result - a logged-in account can no longer grant
-- itself a rental.
-- ============================================================================
drop function if exists public.activate_rental(uuid, text, text, text, text, text, text, text);

notify pgrst, 'reload schema';
