begin;

-- pgcrypto is installed in the extensions schema on hosted Supabase projects.
-- Keep the security-definer functions constrained while allowing their
-- digest/crypt/gen_salt/gen_random_bytes calls to resolve at runtime.
alter function public.bridge_private_listing_seller_portal_access_state(text)
  set search_path = public, extensions;

alter function public.bridge_set_private_listing_seller_portal_password(text, text)
  set search_path = public, extensions;

alter function public.bridge_verify_private_listing_seller_portal_password(text, text)
  set search_path = public, extensions;

alter function public.bridge_reset_private_listing_seller_portal_password(text)
  set search_path = public, extensions;

alter function public.bridge_private_listing_seller_portal_payload(text, text, boolean)
  set search_path = public, extensions;

alter function public.bridge_upload_private_listing_seller_document(text, text, text, text, text, text, uuid, text, text)
  set search_path = public, extensions;

commit;
