begin;

create extension if not exists "pgcrypto";

create table if not exists public.commercial_listings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  team_id uuid references public.commercial_teams(id) on delete set null,
  broker_id uuid references auth.users(id) on delete set null,
  landlord_id uuid references public.commercial_landlords(id) on delete set null,
  property_id uuid references public.commercial_properties(id) on delete set null,
  vacancy_id uuid references public.commercial_vacancies(id) on delete set null,
  listing_type text not null default 'lease',
  listing_category text not null default 'office',
  listing_status text not null default 'draft',
  status text not null default 'active',
  title text not null,
  description text,
  pricing numeric,
  pricing_notes text,
  featured boolean not null default false,
  available_from date,
  metadata_json jsonb not null default '{}'::jsonb,
  marketing_json jsonb not null default '{}'::jsonb,
  media_json jsonb not null default '{}'::jsonb,
  performance_json jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint commercial_listings_title_not_blank check (length(trim(title)) > 0),
  constraint commercial_listings_type_check check (listing_type in ('lease', 'sale', 'investment', 'development')),
  constraint commercial_listings_category_check check (listing_category in ('office', 'industrial', 'retail', 'agricultural', 'mixed_use', 'development_land')),
  constraint commercial_listings_status_check check (listing_status in ('draft', 'coming_soon', 'active', 'under_offer', 'leased', 'sold', 'expired', 'archived'))
);

alter table if exists public.commercial_deals
  add column if not exists listing_id uuid references public.commercial_listings(id) on delete set null;

create index if not exists commercial_listings_organisation_id_idx on public.commercial_listings (organisation_id);
create index if not exists commercial_listings_hierarchy_idx on public.commercial_listings (organisation_id, branch_id, team_id, broker_id);
create index if not exists commercial_listings_landlord_id_idx on public.commercial_listings (landlord_id);
create index if not exists commercial_listings_property_id_idx on public.commercial_listings (property_id);
create index if not exists commercial_listings_vacancy_id_idx on public.commercial_listings (vacancy_id);
create index if not exists commercial_listings_status_idx on public.commercial_listings (listing_status);
create index if not exists commercial_listings_category_idx on public.commercial_listings (listing_category);
create index if not exists commercial_listings_featured_idx on public.commercial_listings (organisation_id, featured);
create index if not exists commercial_deals_listing_id_idx on public.commercial_deals (listing_id);

drop trigger if exists trg_bridge_touch_commercial_listings_updated_at on public.commercial_listings;
create trigger trg_bridge_touch_commercial_listings_updated_at
before update on public.commercial_listings
for each row execute function public.bridge_touch_commercial_updated_at();

insert into public.commercial_listings (
  organisation_id,
  branch_id,
  team_id,
  broker_id,
  landlord_id,
  property_id,
  vacancy_id,
  listing_type,
  listing_category,
  listing_status,
  status,
  title,
  description,
  pricing,
  pricing_notes,
  available_from,
  metadata_json,
  marketing_json,
  media_json,
  performance_json,
  notes,
  created_at,
  updated_at,
  created_by,
  updated_by
)
select
  v.organisation_id,
  v.branch_id,
  v.team_id,
  coalesce(v.broker_id, v.broker_assignment, p.broker_id),
  coalesce(v.landlord_id, p.landlord_id),
  v.property_id,
  v.id,
  'lease',
  case
    when lower(coalesce(p.property_type, '')) in ('office') then 'office'
    when lower(coalesce(p.property_type, '')) in ('industrial', 'warehouse', 'logistics') then 'industrial'
    when lower(coalesce(p.property_type, '')) in ('retail') then 'retail'
    when lower(coalesce(p.property_type, '')) in ('agricultural', 'farm') then 'agricultural'
    when lower(coalesce(p.property_type, '')) in ('mixed_use', 'mixed-use') then 'mixed_use'
    when lower(coalesce(p.property_type, '')) in ('land', 'development_land') then 'development_land'
    else 'office'
  end,
  case
    when v.status in ('leased', 'occupied') then 'leased'
    when v.status in ('reserved', 'under_negotiation') then 'under_offer'
    when v.status in ('upcoming') then 'coming_soon'
    when v.status in ('archived') then 'archived'
    else 'active'
  end,
  case when v.status = 'archived' then 'archived' else 'active' end,
  trim(coalesce(v.vacancy_name, p.property_name, 'Commercial space') || ' To Let'),
  trim(concat_ws(' ', p.property_name, v.unit_or_floor, 'commercial availability.')),
  v.asking_rental,
  case when v.asking_rental is not null then 'Asking rental captured from vacancy.' else null end,
  v.availability_date,
  jsonb_strip_nulls(jsonb_build_object(
    'gla', v.available_area_m2,
    'unit_or_floor', v.unit_or_floor,
    'incentives', v.incentives,
    'fit_out_allowance', v.fit_out_allowance,
    'property_type', p.property_type
  )),
  jsonb_build_object('status', case when v.status in ('available', 'reserved', 'under_negotiation') then 'live' else 'draft' end),
  jsonb_build_object('photos', jsonb_build_array(), 'videos', jsonb_build_array(), 'brochure', null),
  jsonb_build_object('views', 0, 'enquiries', 0, 'requirements_matched', 0, 'deals_created', 0, 'conversion_rate', 0),
  v.notes,
  v.created_at,
  v.updated_at,
  v.created_by,
  v.updated_by
from public.commercial_vacancies v
left join public.commercial_properties p on p.id = v.property_id
where not exists (
  select 1
  from public.commercial_listings existing
  where existing.vacancy_id = v.id
    and existing.listing_type = 'lease'
    and existing.title = trim(coalesce(v.vacancy_name, p.property_name, 'Commercial space') || ' To Let')
);

alter table public.commercial_listings enable row level security;

drop policy if exists commercial_listings_brokerage_access on public.commercial_listings;
create policy commercial_listings_brokerage_access on public.commercial_listings
for all to authenticated
using (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by))
with check (public.bridge_commercial_can_access_record(organisation_id, branch_id, team_id, broker_id, created_by));

grant select, insert, update, delete on public.commercial_listings to authenticated;

commit;
