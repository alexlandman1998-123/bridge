-- The buyer application and wet-ink runtimes support optional portal-link expiry.
-- Older production link tables predate this column. Preserve existing links and
-- their explicit active/revoked state; do not backfill or change expiry dates.
BEGIN;
ALTER TABLE public.client_portal_links
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
COMMENT ON COLUMN public.client_portal_links.expires_at IS
  'Optional buyer portal link expiry. Null preserves availability while the link remains active.';
COMMIT;
