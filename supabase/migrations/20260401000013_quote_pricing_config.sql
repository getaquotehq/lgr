-- =============================================================================
-- LeadGenRentalsHQ — Migration 013: Quote Pricing Config
-- =============================================================================
-- 1. Adds quote_pricing_config JSONB to sms_agent_config for storing pricing
--    items (material costs, cost/m², kW, hours, etc.) and custom formulas.
-- 2. The AI quote-draft function reads this config to auto-generate line items.
-- =============================================================================

-- ─── Quote Pricing Config column ─────────────────────────────────────────────
-- Stores an array of pricing items + an optional formula string.
-- Example value:
-- {
--   "items": [
--     { "description": "Material Cost", "type": "fixed", "rate": 50, "unit": "per job" },
--     { "description": "Labour",        "type": "per_hour", "rate": 85, "unit": "per hour" },
--     { "description": "Roof Tiles",    "type": "per_m2",  "rate": 45, "unit": "per m²" },
--     { "description": "Electrical",    "type": "per_kw",  "rate": 120, "unit": "per kW" }
--   ],
--   "formula": "Labour hours × rate + materials + travel",
--   "tax_rate": 10,
--   "currency": "AUD",
--   "notes": "All prices include GST"
-- }

ALTER TABLE public.sms_agent_config
  ADD COLUMN IF NOT EXISTS quote_pricing_config jsonb DEFAULT '{}';

COMMENT ON COLUMN public.sms_agent_config.quote_pricing_config IS
  'Pricing items and formula used by AI when auto-drafting quotes. Contains items array, optional formula, tax_rate, currency, and notes.';
