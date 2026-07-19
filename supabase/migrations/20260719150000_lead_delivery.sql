-- ============================================================================
-- Lead delivery pipeline (port of ql-mc's deliver-lead)
--
-- LGR difference: a lead is already attributed to an installer at capture time
-- (assets.rented_by), so "delivery" means pushing that lead to *its* installer
-- over the installer's preferred channel (email / SMS / webhook). The panel's
-- "Deliver →" button calls the deliver-lead Edge Function, which writes the
-- delivery attempt into lead_delivery_log and stamps leads.delivered_at.
-- ============================================================================

-- 1. Installer delivery config -----------------------------------------------
alter table installers add column if not exists delivery_method text not null default 'email'
  check (delivery_method in ('email','sms','webhook','email_and_sms'));
alter table installers add column if not exists delivery_email text;   -- defaults to email
alter table installers add column if not exists delivery_phone text;   -- defaults to phone
alter table installers add column if not exists webhook_url text;

-- 2. Track the actual push on the lead ---------------------------------------
alter table leads add column if not exists delivered_at timestamptz;   -- when pushed to installer
alter table leads add column if not exists delivery_error text;

-- 3. Richer delivery-log columns (mirrors ql-mc's lead_delivery_log) ----------
alter table lead_delivery_log add column if not exists destination text;
alter table lead_delivery_log add column if not exists message_preview text;
alter table lead_delivery_log add column if not exists response_code int;
alter table lead_delivery_log add column if not exists response_body text;
alter table lead_delivery_log add column if not exists delivered_at timestamptz;
