-- Make the webhook signing secret optional. When a secret is set, deliveries are
-- signed with HMAC-SHA256 (X-Webhook-Signature header); when it's NULL, the lead
-- is still delivered, just unsigned. Existing rows already have a secret, so this
-- only affects endpoints created without one from here on.
alter table public.webhook_endpoints
  alter column secret drop not null;
