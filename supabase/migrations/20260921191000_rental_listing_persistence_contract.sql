begin;

-- Rental capture stores the portal-ready source of truth in canonical facts.
-- Keep these additions idempotent: older environments may not yet have the
-- location or canonical-fact columns used by the rentals create flow.
alter table if exists public.private_listings
  add column if not exists seller_canonical_facts_json jsonb not null default '{}'::jsonb,
  add column if not exists seller_canonical_fact_readiness_json jsonb not null default '{}'::jsonb,
  add column if not exists seller_canonical_facts_updated_at timestamptz,
  add column if not exists formatted_address text,
  add column if not exists street_number text,
  add column if not exists street_name text,
  add column if not exists street_address text,
  add column if not exists country text;

do $$
begin
  if to_regclass('public.private_listings') is not null then
    create index if not exists private_listings_seller_canonical_facts_gin_idx
      on public.private_listings using gin (seller_canonical_facts_json);

    comment on column public.private_listings.seller_canonical_facts_json is
      'Canonical rental capture facts. Required to retain rental terms, portal attributes, and property detail after draft creation.';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
