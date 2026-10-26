-- The security-invoker seller continuity view calls this helper as its reader.
-- Preserve that workflow while enforcing transactions RLS for direct callers.
BEGIN;
ALTER FUNCTION public.bridge_resolve_private_listing_transaction_id(uuid) SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.bridge_resolve_private_listing_transaction_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bridge_resolve_private_listing_transaction_id(uuid) TO anon, authenticated, service_role;
COMMIT;
