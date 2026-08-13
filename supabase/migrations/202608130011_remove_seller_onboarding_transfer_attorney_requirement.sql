begin;

drop trigger if exists private_listing_seller_onboarding_require_preferred_attorney_acceptance
  on public.private_listing_seller_onboarding;

drop function if exists public.bridge_require_seller_preferred_transfer_attorney_acceptance();

comment on table public.private_listing_seller_onboarding is
  'Stores seller onboarding links and form progress. Seller onboarding no longer collects or requires transfer attorney preferences; transfer attorney selection belongs to the buyer lead flow.';

notify pgrst, 'reload schema';

commit;
