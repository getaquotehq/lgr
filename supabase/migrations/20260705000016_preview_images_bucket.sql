-- ============================================================================
-- Storage bucket for uploaded preview screenshots
-- ============================================================================
-- Public bucket: files are readable via their public URL (so an <img> renders
-- without a signed URL). Uploads happen ONLY through the va-api edge function
-- using the service role, which bypasses storage RLS — so no storage policy is
-- needed and the anon key cannot write here.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'preview-images',
  'preview-images',
  true,
  10485760,  -- 10 MB per file
  array['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
