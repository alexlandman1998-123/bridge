begin;

create extension if not exists pgcrypto with schema extensions;

alter table if exists public.private_listing_seller_onboarding
  alter column seller_portal_token
  set default ('seller-portal-' || encode(extensions.gen_random_bytes(24), 'hex'));

commit;
