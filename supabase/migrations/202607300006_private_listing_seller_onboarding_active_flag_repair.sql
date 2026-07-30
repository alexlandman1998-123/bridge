begin;

alter table public.private_listing_seller_onboarding
  add column if not exists is_active boolean not null default true;

update public.private_listing_seller_onboarding
   set is_active = true
 where is_active is distinct from true;

create index if not exists private_listing_seller_onboarding_active_token_idx
  on public.private_listing_seller_onboarding (token, updated_at desc)
  where is_active is true;

create index if not exists private_listing_seller_onboarding_active_portal_token_idx
  on public.private_listing_seller_onboarding (seller_portal_token, updated_at desc)
  where is_active is true
    and seller_portal_token is not null;

notify pgrst, 'reload schema';

commit;
