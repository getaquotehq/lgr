-- ============================================================================
-- Engine plan pricing: no setup fee. From $690 + GST a month, with the first
-- payment covering the first 30 days.
--
-- Reverses the charge introduced in 20261011000000_engine_setup_fee.sql. The
-- column stays so rental_checkouts history keeps its snapshot; it is zeroed and
-- defaults to 0, and create-rental-checkout no longer reads it.
--
-- Live rentals are untouched: their fee was snapshotted at checkout.
-- ============================================================================

alter table public.assets alter column setup_fee_aud set default 0;
update public.assets set setup_fee_aud = 0 where setup_fee_aud <> 0;

comment on column public.assets.setup_fee_aud is
  'Retired: the Engine plan has no setup fee. Kept at 0 for history; not charged.';

comment on column public.assets.tier is
  'engine = the standard self-serve product (from $690/mo + GST, no setup fee, '
  'plus $50/day to Meta, 10 quotes guaranteed). custom = a scoped engagement, quoted by hand, '
  'never self-serve. Tier is the SERVICE LEVEL and has nothing to do with which funnel brand '
  'the engine is.';
