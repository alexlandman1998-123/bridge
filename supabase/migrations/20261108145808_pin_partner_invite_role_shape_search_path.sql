begin;

-- This role mapper uses literal CASE expressions only. Pinning the namespace
-- preserves its output and grants while removing the mutable-search-path warning.
alter function public.bridge_transaction_partner_invite_role_shape(text)
  set search_path = '';

notify pgrst, 'reload schema';
commit;
