-- =============================================================================
-- Custom password-reset tokens
-- =============================================================================
-- Stores hashed tokens for password reset so we never call
-- admin.generateLink({ type: "recovery" }) which triggers Supabase's
-- built-in mailer (duplicate email).  Our edge functions generate a random
-- token, hash it, store it here, and send the raw token via Resend.
-- The complete-password-reset edge function verifies the token and updates
-- the user's password via the admin API.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash  text        NOT NULL UNIQUE,
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_prt_token_hash ON public.password_reset_tokens (token_hash);

-- Index for cleanup of expired tokens
CREATE INDEX IF NOT EXISTS idx_prt_expires_at ON public.password_reset_tokens (expires_at);

-- RLS: only the service-role key should access this table
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- No RLS policies = no access via anon/authenticated roles.
-- The edge functions use the service-role key which bypasses RLS.

-- Helper: look up a user ID by email (avoids exposing the auth schema to PostgREST)
CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(user_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
    SELECT id FROM auth.users WHERE lower(email) = lower(user_email) LIMIT 1;
$$;

-- Cleanup: delete tokens older than 24 hours (called periodically or on insert)
CREATE OR REPLACE FUNCTION public.cleanup_expired_reset_tokens()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.password_reset_tokens
    WHERE expires_at < now() - interval '24 hours';
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cleanup_expired_reset_tokens
    AFTER INSERT ON public.password_reset_tokens
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.cleanup_expired_reset_tokens();
