-- =============================================================================
-- LeadGenRentalsHQ — Integrations & REST API
-- =============================================================================
-- Adds:
--   1. company_api_tokens  – API keys for programmatic access
--   2. webhook_endpoints   – Outbound webhook delivery targets
--   3. webhook_deliveries  – Delivery log for debugging
-- =============================================================================

-- ── 1. API Tokens ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.company_api_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,                          -- SHA-256 hex of the raw token
  token_prefix TEXT NOT NULL,                          -- first 8 chars for UI identification
  name         TEXT NOT NULL DEFAULT 'Unnamed Key',    -- user-given label
  scopes       JSONB NOT NULL DEFAULT '["leads:read","quotes:read","appointments:read","pipeline:read"]'::jsonb,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ,                            -- NULL = never expires
  revoked_at   TIMESTAMPTZ                             -- non-NULL = revoked
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON public.company_api_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_api_tokens_company ON public.company_api_tokens (company_id);

ALTER TABLE public.company_api_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own company API tokens"
    ON public.company_api_tokens FOR SELECT
    USING (company_id = public.current_company_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create API tokens for own company"
    ON public.company_api_tokens FOR INSERT
    WITH CHECK (company_id = public.current_company_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own company API tokens"
    ON public.company_api_tokens FOR UPDATE
    USING (company_id = public.current_company_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own company API tokens"
    ON public.company_api_tokens FOR DELETE
    USING (company_id = public.current_company_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── 2. Webhook Endpoints ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  events       JSONB NOT NULL DEFAULT '["lead.created","quote.accepted","appointment.booked"]'::jsonb,
  secret       TEXT NOT NULL,                          -- HMAC-SHA256 signing secret
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_company ON public.webhook_endpoints (company_id);

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own company webhooks"
    ON public.webhook_endpoints FOR SELECT
    USING (company_id = public.current_company_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create webhooks for own company"
    ON public.webhook_endpoints FOR INSERT
    WITH CHECK (company_id = public.current_company_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own company webhooks"
    ON public.webhook_endpoints FOR UPDATE
    USING (company_id = public.current_company_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own company webhooks"
    ON public.webhook_endpoints FOR DELETE
    USING (company_id = public.current_company_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER set_webhook_endpoints_updated_at
  BEFORE UPDATE ON public.webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 3. Webhook Deliveries (audit log) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event           TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_status INT,
  response_body   TEXT,
  attempt         INT NOT NULL DEFAULT 1,
  success         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON public.webhook_deliveries (webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_company ON public.webhook_deliveries (company_id);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own company webhook deliveries"
    ON public.webhook_deliveries FOR SELECT
    USING (company_id = public.current_company_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── 4. Realtime ───────────────────────────────────────────────────────────────
-- Enable realtime on webhook_deliveries so the UI can show live delivery status
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_deliveries;
EXCEPTION WHEN others THEN NULL;
END $$;
