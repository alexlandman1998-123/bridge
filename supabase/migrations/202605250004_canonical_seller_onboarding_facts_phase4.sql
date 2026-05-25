begin;

alter table if exists public.private_listing_seller_onboarding
  add column if not exists canonical_facts_json jsonb not null default '{}'::jsonb,
  add column if not exists canonical_fact_readiness_json jsonb not null default '{}'::jsonb,
  add column if not exists canonical_facts_updated_at timestamptz;

alter table if exists public.private_listings
  add column if not exists seller_canonical_facts_json jsonb not null default '{}'::jsonb,
  add column if not exists seller_canonical_fact_readiness_json jsonb not null default '{}'::jsonb,
  add column if not exists seller_canonical_facts_updated_at timestamptz;

do $$
begin
  if to_regclass('public.private_listing_seller_onboarding') is not null then
    create index if not exists private_listing_seller_onboarding_canonical_facts_gin_idx
      on public.private_listing_seller_onboarding using gin (canonical_facts_json);
  end if;

  if to_regclass('public.private_listings') is not null then
    create index if not exists private_listings_seller_canonical_facts_gin_idx
      on public.private_listings using gin (seller_canonical_facts_json);
  end if;
end $$;

do $$
begin
  if to_regclass('public.private_listing_seller_onboarding') is not null then
    comment on column public.private_listing_seller_onboarding.canonical_facts_json is
      'Normalized seller onboarding facts used by the canonical document resolver. Additive compatibility storage.';
    comment on column public.private_listing_seller_onboarding.canonical_fact_readiness_json is
      'Completeness and validation summary for normalized seller onboarding facts.';
    comment on column public.private_listing_seller_onboarding.canonical_facts_updated_at is
      'Timestamp of the last normalized seller fact payload update.';
  end if;

  if to_regclass('public.private_listings') is not null then
    comment on column public.private_listings.seller_canonical_facts_json is
      'Latest normalized seller facts for listing-level canonical document resolution.';
    comment on column public.private_listings.seller_canonical_fact_readiness_json is
      'Latest seller fact completeness summary for listing-level canonical document resolution.';
    comment on column public.private_listings.seller_canonical_facts_updated_at is
      'Timestamp of the latest listing-level seller canonical facts update.';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
