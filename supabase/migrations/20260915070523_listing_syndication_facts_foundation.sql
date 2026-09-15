begin;

create table if not exists public.listing_syndication_facts (
  listing_id uuid primary key references public.private_listings(id) on delete cascade,
  property_category text,
  property_subtype text,
  listing_purpose text,
  mandate_type text,
  price_presentation text,
  offers_from_price numeric(14, 2),
  rental_price_period text,
  available_from date,
  floor_area numeric(12, 2),
  floor_area_unit text not null default 'SquareMetres',
  land_area numeric(14, 2),
  land_area_unit text not null default 'SquareMetres',
  rates_taxes_amount numeric(12, 2),
  levies_amount numeric(12, 2),
  address_privacy jsonb not null default '{}'::jsonb,
  feature_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_syndication_facts_listing_purpose_check
    check (listing_purpose is null or listing_purpose in ('Sale', 'Rental')),
  constraint listing_syndication_facts_price_presentation_check
    check (price_presentation is null or price_presentation in ('Standard', 'Poa', 'Negotiable', 'OffersFrom')),
  constraint listing_syndication_facts_rental_price_period_check
    check (rental_price_period is null or rental_price_period in ('PerMonth', 'PerWeek', 'PerDay', 'PerM2')),
  constraint listing_syndication_facts_floor_area_unit_check
    check (floor_area_unit in ('SquareMetres', 'SquareFeet')),
  constraint listing_syndication_facts_land_area_unit_check
    check (land_area_unit in ('SquareMetres', 'Hectares', 'Acres')),
  constraint listing_syndication_facts_offers_from_check
    check (offers_from_price is null or offers_from_price > 0),
  constraint listing_syndication_facts_feature_values_object_check
    check (jsonb_typeof(feature_values) = 'object'),
  constraint listing_syndication_facts_address_privacy_object_check
    check (jsonb_typeof(address_privacy) = 'object')
);

create table if not exists public.listing_syndication_agent_assignments (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.private_listings(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete restrict,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_syndication_agent_assignments_position_check check (position > 0),
  constraint listing_syndication_agent_assignments_listing_agent_unique unique (listing_id, agent_id),
  constraint listing_syndication_agent_assignments_listing_position_unique unique (listing_id, position)
);

create index if not exists listing_syndication_agent_assignments_listing_position_idx
  on public.listing_syndication_agent_assignments (listing_id, position);

create index if not exists listing_syndication_facts_feature_values_gin_idx
  on public.listing_syndication_facts using gin (feature_values);

create index if not exists listing_syndication_facts_property_category_idx
  on public.listing_syndication_facts (property_category)
  where property_category is not null;

create or replace function public.bridge_set_listing_syndication_facts_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_listing_syndication_facts_updated_at on public.listing_syndication_facts;
create trigger trg_listing_syndication_facts_updated_at
before update on public.listing_syndication_facts
for each row
execute function public.bridge_set_listing_syndication_facts_updated_at();

drop trigger if exists trg_listing_syndication_agent_assignments_updated_at on public.listing_syndication_agent_assignments;
create trigger trg_listing_syndication_agent_assignments_updated_at
before update on public.listing_syndication_agent_assignments
for each row
execute function public.bridge_set_listing_syndication_facts_updated_at();

grant select, insert, update, delete on public.listing_syndication_facts to authenticated;
grant select, insert, update, delete on public.listing_syndication_agent_assignments to authenticated;

alter table public.listing_syndication_facts enable row level security;
alter table public.listing_syndication_agent_assignments enable row level security;

create policy listing_syndication_facts_member_access
on public.listing_syndication_facts
for all
to authenticated
using (
  exists (
    select 1
    from public.private_listings listing
    join public.organisation_users member
      on member.organisation_id = listing.organisation_id
    where listing.id = listing_syndication_facts.listing_id
      and member.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.private_listings listing
    join public.organisation_users member
      on member.organisation_id = listing.organisation_id
    where listing.id = listing_syndication_facts.listing_id
      and member.user_id = (select auth.uid())
  )
);

create policy listing_syndication_agent_assignments_member_access
on public.listing_syndication_agent_assignments
for all
to authenticated
using (
  exists (
    select 1
    from public.private_listings listing
    join public.organisation_users member
      on member.organisation_id = listing.organisation_id
    where listing.id = listing_syndication_agent_assignments.listing_id
      and member.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.private_listings listing
    join public.organisation_users member
      on member.organisation_id = listing.organisation_id
    where listing.id = listing_syndication_agent_assignments.listing_id
      and member.user_id = (select auth.uid())
  )
);

comment on table public.listing_syndication_facts is
  'Additive canonical listing facts shared by portal syndication adapters. Existing listing fields remain compatible fallbacks.';
comment on table public.listing_syndication_agent_assignments is
  'Ordered Arch9 agent assignments for channel-specific syndication. This does not alter the existing primary assigned agent.';

notify pgrst, 'reload schema';
commit;
