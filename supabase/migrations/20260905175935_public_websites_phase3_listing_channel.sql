begin;

create table if not exists public.website_listing_publications (
  id uuid primary key default gen_random_uuid(),
  website_site_id uuid not null references public.website_sites(id) on delete cascade,
  listing_id uuid not null references public.private_listings(id) on delete cascade,
  status text not null default 'published' check (status in ('published', 'unpublished')),
  publication_json jsonb not null default '{}'::jsonb,
  media_json jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  unpublished_at timestamptz,
  last_synced_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_listing_publications_listing_unique unique (listing_id),
  constraint website_listing_publications_site_listing_unique unique (website_site_id, listing_id),
  constraint website_listing_publications_publication_object_check check (jsonb_typeof(publication_json) = 'object'),
  constraint website_listing_publications_media_array_check check (jsonb_typeof(media_json) = 'array')
);

create index if not exists website_listing_publications_site_status_idx
  on public.website_listing_publications (website_site_id, status, last_synced_at desc);

drop trigger if exists trg_website_listing_publications_updated_at on public.website_listing_publications;
create trigger trg_website_listing_publications_updated_at
before update on public.website_listing_publications
for each row execute function public.set_updated_at_timestamp();

alter table public.website_listing_publications enable row level security;
revoke all on table public.website_listing_publications from anon, authenticated;
grant select on table public.website_listing_publications to service_role;

drop policy if exists website_listing_publications_member_select on public.website_listing_publications;
create policy website_listing_publications_member_select
on public.website_listing_publications
for select
to authenticated
using (
  exists (
    select 1
    from public.website_sites site
    where site.id = website_listing_publications.website_site_id
      and (select public.bridge_is_active_member(site.organisation_id))
  )
);

create or replace function public.website_get_listing_publication_status(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_listing public.private_listings%rowtype;
  v_site public.website_sites%rowtype;
  v_projection public.listing_publication_data%rowtype;
  v_channel public.website_listing_publications%rowtype;
  v_hostname text;
  v_image_count integer := 0;
  v_blockers jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to inspect website publication.' using errcode = '42501';
  end if;

  select listing.*
  into v_listing
  from public.private_listings listing
  where listing.id = p_listing_id;

  if not found then
    raise exception 'Listing not found.' using errcode = 'P0002';
  end if;

  if not public.bridge_is_active_member(v_listing.organisation_id) then
    raise exception 'This listing is outside your active organisation.' using errcode = '42501';
  end if;

  select site.*
  into v_site
  from public.website_sites site
  where site.organisation_id = v_listing.organisation_id;

  if v_site.id is null then
    v_blockers := v_blockers || to_jsonb('Create the organisation website before publishing a listing.'::text);
  elsif v_site.status <> 'published' then
    v_blockers := v_blockers || to_jsonb('Publish the organisation website before publishing listing stock.'::text);
  end if;

  if v_site.id is not null then
    select domain.hostname
    into v_hostname
    from public.website_domains domain
    where domain.website_site_id = v_site.id
      and domain.status = 'active'
    order by domain.is_primary desc, case domain.domain_kind when 'custom' then 0 else 1 end, domain.created_at
    limit 1;

    if v_hostname is null then
      v_blockers := v_blockers || to_jsonb('Activate a website domain before publishing listing stock.'::text);
    end if;
  end if;

  select publication.*
  into v_projection
  from public.listing_publication_data publication
  where publication.listing_id = v_listing.id;

  if v_projection.id is null then
    v_blockers := v_blockers || to_jsonb('Save the listing publication details before publishing it to the website.'::text);
  else
    if v_projection.status <> 'Published' then
      v_blockers := v_blockers || to_jsonb('Publish the listing projection before enabling the agency-website channel.'::text);
    end if;
    if nullif(trim(v_projection.title), '') is null then
      v_blockers := v_blockers || to_jsonb('Add a public listing title.'::text);
    end if;
    if nullif(trim(v_projection.property_type), '') is null then
      v_blockers := v_blockers || to_jsonb('Select a public property type.'::text);
    end if;
    if v_projection.listing_type not in ('Sale', 'Rental') then
      v_blockers := v_blockers || to_jsonb('Select whether the listing is for sale or rental.'::text);
    end if;
    if coalesce(v_projection.asking_price, 0) <= 0 then
      v_blockers := v_blockers || to_jsonb('Add a positive asking price.'::text);
    end if;
    if nullif(trim(v_projection.suburb), '') is null then
      v_blockers := v_blockers || to_jsonb('Add the listing suburb.'::text);
    end if;
  end if;

  select count(*)::integer
  into v_image_count
  from public.listing_media media
  where media.listing_id = v_listing.id
    and media.media_type = 'image'
    and media.file_url ~* '^https://[^[:space:]]+$';

  if v_image_count = 0 then
    v_blockers := v_blockers || to_jsonb('Add at least one public HTTPS listing image.'::text);
  end if;

  if v_site.id is not null then
    select channel.*
    into v_channel
    from public.website_listing_publications channel
    where channel.website_site_id = v_site.id
      and channel.listing_id = v_listing.id;
  end if;

  return jsonb_build_object(
    'listingId', v_listing.id,
    'websiteSiteId', v_site.id,
    'websiteStatus', v_site.status,
    'hostname', v_hostname,
    'status', coalesce(v_channel.status, 'not_published'),
    'eligible', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'projectionStatus', v_projection.status,
    'projectionUpdatedAt', v_projection.updated_at,
    'imageCount', v_image_count,
    'stale', coalesce(v_channel.status = 'published' and v_projection.updated_at > v_channel.last_synced_at, false),
    'publishedAt', v_channel.published_at,
    'unpublishedAt', v_channel.unpublished_at,
    'lastSyncedAt', v_channel.last_synced_at
  );
end;
$$;

create or replace function public.website_set_listing_publication(
  p_listing_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_listing public.private_listings%rowtype;
  v_site public.website_sites%rowtype;
  v_projection public.listing_publication_data%rowtype;
  v_existing public.website_listing_publications%rowtype;
  v_image_count integer := 0;
  v_publication_json jsonb;
  v_media_json jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to manage website publication.' using errcode = '42501';
  end if;

  if v_action not in ('publish', 'update', 'unpublish') then
    raise exception 'Website listing action must be publish, update or unpublish.' using errcode = '22023';
  end if;

  select listing.*
  into v_listing
  from public.private_listings listing
  where listing.id = p_listing_id
  for update;

  if not found then
    raise exception 'Listing not found.' using errcode = 'P0002';
  end if;

  if not public.bridge_is_active_member(v_listing.organisation_id) then
    raise exception 'This listing is outside your active organisation.' using errcode = '42501';
  end if;

  select site.*
  into v_site
  from public.website_sites site
  where site.organisation_id = v_listing.organisation_id;

  if not found then
    raise exception 'Create the organisation website before managing its listing channel.' using errcode = 'P0002';
  end if;

  select channel.*
  into v_existing
  from public.website_listing_publications channel
  where channel.listing_id = v_listing.id
  for update;

  if v_action = 'unpublish' then
    if v_existing.id is not null then
      update public.website_listing_publications
      set status = 'unpublished',
          unpublished_at = now(),
          updated_by = v_user_id
      where id = v_existing.id;
    end if;
    return public.website_get_listing_publication_status(v_listing.id);
  end if;

  if v_site.status <> 'published' then
    raise exception 'Publish the organisation website before publishing listing stock.' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.website_domains domain
    where domain.website_site_id = v_site.id
      and domain.status = 'active'
  ) then
    raise exception 'Activate a website domain before publishing listing stock.' using errcode = '23514';
  end if;

  select publication.*
  into v_projection
  from public.listing_publication_data publication
  where publication.listing_id = v_listing.id
  for update;

  if not found or v_projection.status <> 'Published' then
    raise exception 'A Published listing projection is required for the agency website.' using errcode = '23514';
  end if;

  if nullif(trim(v_projection.title), '') is null
    or nullif(trim(v_projection.property_type), '') is null
    or v_projection.listing_type not in ('Sale', 'Rental')
    or coalesce(v_projection.asking_price, 0) <= 0
    or nullif(trim(v_projection.suburb), '') is null then
    raise exception 'Complete the public title, property type, listing type, price and suburb before publishing.' using errcode = '23514';
  end if;

  select count(*)::integer
  into v_image_count
  from public.listing_media media
  where media.listing_id = v_listing.id
    and media.media_type = 'image'
    and media.file_url ~* '^https://[^[:space:]]+$';

  if v_image_count = 0 then
    raise exception 'At least one public HTTPS listing image is required.' using errcode = '23514';
  end if;

  if v_action = 'update' and coalesce(v_existing.status, '') <> 'published' then
    raise exception 'Publish the listing to the agency website before updating it.' using errcode = '23514';
  end if;

  v_publication_json := jsonb_strip_nulls(jsonb_build_object(
    'listing_id', v_projection.listing_id,
    'title', v_projection.title,
    'suburb', v_projection.suburb,
    'province', v_projection.province,
    'property_type', v_projection.property_type,
    'listing_type', v_projection.listing_type,
    'asking_price', v_projection.asking_price,
    'bedrooms', v_projection.bedrooms,
    'bathrooms', v_projection.bathrooms,
    'parking_bays', v_projection.parking_bays,
    'floor_size', v_projection.floor_size,
    'description', v_projection.description,
    'features', v_projection.features,
    'amenities', v_projection.amenities
  ));

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'media_type', media.media_type,
        'file_url', media.file_url,
        'caption', media.caption,
        'sort_order', media.sort_order
      )) order by media.sort_order, media.id
    ),
    '[]'::jsonb
  )
  into v_media_json
  from public.listing_media media
  where media.listing_id = v_listing.id
    and media.media_type in ('image', 'floor_plan', 'video', 'virtual_tour')
    and media.file_url ~* '^https://[^[:space:]]+$';

  insert into public.website_listing_publications (
    website_site_id,
    listing_id,
    status,
    publication_json,
    media_json,
    published_at,
    unpublished_at,
    last_synced_at,
    created_by,
    updated_by
  ) values (
    v_site.id,
    v_listing.id,
    'published',
    v_publication_json,
    v_media_json,
    now(),
    null,
    now(),
    v_user_id,
    v_user_id
  )
  on conflict (listing_id) do update
  set website_site_id = excluded.website_site_id,
      status = 'published',
      publication_json = excluded.publication_json,
      media_json = excluded.media_json,
      published_at = coalesce(public.website_listing_publications.published_at, excluded.published_at),
      unpublished_at = null,
      last_synced_at = excluded.last_synced_at,
      updated_by = excluded.updated_by;

  return public.website_get_listing_publication_status(v_listing.id);
end;
$$;

revoke all on function public.website_get_listing_publication_status(uuid) from public, anon;
revoke all on function public.website_set_listing_publication(uuid, text) from public, anon;
grant execute on function public.website_get_listing_publication_status(uuid) to authenticated;
grant execute on function public.website_set_listing_publication(uuid, text) to authenticated;

comment on table public.website_listing_publications is
  'Explicit agency-website channel state for canonical private listings. Public rendering also requires a Published listing projection.';
comment on function public.website_get_listing_publication_status(uuid) is
  'Returns tenant-scoped website publication state and readiness blockers for one CRM listing.';
comment on function public.website_set_listing_publication(uuid, text) is
  'Publishes, refreshes or unpublishes one eligible CRM listing on its organisation website channel.';

notify pgrst, 'reload schema';

commit;
