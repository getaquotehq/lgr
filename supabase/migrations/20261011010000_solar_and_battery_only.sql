-- LGR sells solar and solar battery only. Hard-delete the other trades.
-- Checked before running: hvac, roofing and renovations had no engines,
-- rentals or leads, so only the niche rows remain to remove.
delete from public.niches where slug in ('hvac', 'roofing', 'renovations');

notify pgrst, 'reload schema';
