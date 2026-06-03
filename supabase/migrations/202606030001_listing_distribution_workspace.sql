begin;

create table if not exists public.listing_publication_data (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.private_listings(id) on delete cascade,
  title text,
  address text,
  suburb text,
  province text,
  property_type text,
  listing_type text not null default 'Sale',
  asking_price numeric(14, 2),
  bedrooms integer,
  bathrooms numeric(5, 1),
  garages integer,
  parking_bays integer,
  floor_size numeric(12, 2),
  erf_size numeric(12, 2),
  rates_taxes numeric(12, 2),
  levies numeric(12, 2),
  description text,
  features jsonb not null default '[]'::jsonb,
  amenities jsonb not null default '[]'::jsonb,
  status text not null default 'Draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_publication_data_listing_unique unique (listing_id),
  constraint listing_publication_data_listing_type_check check (listing_type in ('Sale', 'Rental')),
  constraint listing_publication_data_status_check check (status in ('Draft', 'Ready', 'Published', 'Archived'))
);

create table if not exists public.listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.private_listings(id) on delete cascade,
  media_type text not null,
  file_url text not null,
  caption text,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_media_media_type_check check (media_type in ('image', 'floor_plan', 'video', 'virtual_tour', 'other'))
);

create table if not exists public.listing_external_links (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.private_listings(id) on delete cascade,
  platform text not null,
  url text not null,
  status text not null default 'Draft',
  published_at date,
  last_checked_at date,
  notes text,
  visible_to_seller boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_external_links_status_check check (status in ('Draft', 'Live', 'Published', 'Removed', 'Expired'))
);

create index if not exists listing_publication_data_listing_id_idx
  on public.listing_publication_data(listing_id);

create index if not exists listing_media_listing_id_sort_idx
  on public.listing_media(listing_id, sort_order);

create index if not exists listing_external_links_listing_id_idx
  on public.listing_external_links(listing_id);

create index if not exists listing_external_links_seller_visible_idx
  on public.listing_external_links(listing_id, visible_to_seller)
  where visible_to_seller is true;

create or replace function public.bridge_set_listing_external_link_visibility()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.visible_to_seller := new.status in ('Live', 'Published');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_listing_external_links_visibility on public.listing_external_links;
create trigger trg_listing_external_links_visibility
before insert or update of status
on public.listing_external_links
for each row
execute function public.bridge_set_listing_external_link_visibility();

drop trigger if exists trg_listing_publication_data_updated_at on public.listing_publication_data;
create trigger trg_listing_publication_data_updated_at
before update on public.listing_publication_data
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists trg_listing_media_updated_at on public.listing_media;
create trigger trg_listing_media_updated_at
before update on public.listing_media
for each row
execute function public.set_updated_at_timestamp();

grant select, insert, update, delete on public.listing_publication_data to authenticated;
grant select, insert, update, delete on public.listing_media to authenticated;
grant select, insert, update, delete on public.listing_external_links to authenticated;

alter table public.listing_publication_data enable row level security;
alter table public.listing_media enable row level security;
alter table public.listing_external_links enable row level security;

create policy listing_publication_data_member_access
on public.listing_publication_data
for all
using (
  exists (
    select 1
    from public.private_listings listing
    join public.organisation_users member
      on member.organisation_id = listing.organisation_id
    where listing.id = listing_publication_data.listing_id
      and member.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.private_listings listing
    join public.organisation_users member
      on member.organisation_id = listing.organisation_id
    where listing.id = listing_publication_data.listing_id
      and member.user_id = auth.uid()
  )
);

create policy listing_media_member_access
on public.listing_media
for all
using (
  exists (
    select 1
    from public.private_listings listing
    join public.organisation_users member
      on member.organisation_id = listing.organisation_id
    where listing.id = listing_media.listing_id
      and member.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.private_listings listing
    join public.organisation_users member
      on member.organisation_id = listing.organisation_id
    where listing.id = listing_media.listing_id
      and member.user_id = auth.uid()
  )
);

create policy listing_external_links_member_access
on public.listing_external_links
for all
using (
  exists (
    select 1
    from public.private_listings listing
    join public.organisation_users member
      on member.organisation_id = listing.organisation_id
    where listing.id = listing_external_links.listing_id
      and member.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.private_listings listing
    join public.organisation_users member
      on member.organisation_id = listing.organisation_id
    where listing.id = listing_external_links.listing_id
      and member.user_id = auth.uid()
  )
);

commit;
