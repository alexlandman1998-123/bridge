begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-media',
  'listing-media',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'application/pdf']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.website_listing_media_assets (
  id uuid primary key default gen_random_uuid(),
  website_site_id uuid not null references public.website_sites(id) on delete cascade,
  listing_id uuid not null references public.private_listings(id) on delete cascade,
  source_media_id uuid references public.listing_media(id) on delete set null,
  media_type text not null check (media_type in ('image', 'floor_plan')),
  source_bucket text not null,
  source_path text not null,
  source_fingerprint text not null,
  storage_bucket text not null default 'listing-media' check (storage_bucket = 'listing-media'),
  storage_path text not null,
  public_url text not null check (public_url ~* '^https://[^[:space:]]+$'),
  content_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 15728640),
  status text not null default 'active' check (status in ('active', 'retired', 'deleted')),
  published_at timestamptz not null default now(),
  retired_at timestamptz,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_listing_media_assets_source_unique unique (website_site_id, source_media_id),
  constraint website_listing_media_assets_storage_unique unique (storage_bucket, storage_path),
  constraint website_listing_media_assets_content_type_check check (
    content_type ~* '^image/' or (media_type = 'floor_plan' and content_type = 'application/pdf')
  )
);

create index if not exists website_listing_media_assets_listing_status_idx
  on public.website_listing_media_assets (listing_id, status, updated_at desc);

drop trigger if exists trg_website_listing_media_assets_updated_at on public.website_listing_media_assets;
create trigger trg_website_listing_media_assets_updated_at
before update on public.website_listing_media_assets
for each row execute function public.set_updated_at_timestamp();

alter table public.website_listing_media_assets enable row level security;
revoke all on table public.website_listing_media_assets from public, anon, authenticated;
grant select, insert, update, delete on table public.website_listing_media_assets to service_role;

create or replace function public.website_register_listing_media_assets(
  p_listing_id uuid,
  p_actor_id uuid,
  p_actor_email text,
  p_assets jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.private_listings%rowtype;
  v_site public.website_sites%rowtype;
  v_expected_count integer := 0;
  v_requested_count integer := 0;
  v_active_count integer := 0;
begin
  if p_actor_id is null then
    raise exception 'A verified actor is required to prepare website media.' using errcode = '42501';
  end if;

  select listing.*
  into v_listing
  from public.private_listings listing
  where listing.id = p_listing_id;

  if not found then
    raise exception 'Listing not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.organisation_users member
    where member.organisation_id = v_listing.organisation_id
      and (
        member.user_id = p_actor_id
        or (
          member.user_id is null
          and nullif(lower(trim(member.email)), '') is not null
          and lower(trim(member.email)) = lower(trim(coalesce(p_actor_email, '')))
        )
      )
      and lower(trim(coalesce(member.membership_status, member.status, ''))) in ('active', 'accepted')
  ) then
    raise exception 'This listing is outside the actor''s active organisation.' using errcode = '42501';
  end if;

  select site.*
  into v_site
  from public.website_sites site
  where site.organisation_id = v_listing.organisation_id;

  if not found then
    raise exception 'Create the organisation website before preparing listing media.' using errcode = 'P0002';
  end if;

  if jsonb_typeof(coalesce(p_assets, 'null'::jsonb)) <> 'array' then
    raise exception 'Website media assets must be supplied as an array.' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_expected_count
  from public.listing_media media
  where media.listing_id = p_listing_id
    and media.media_type in ('image', 'floor_plan')
    and media.file_url ~* '^https://[^[:space:]]+$';

  select count(distinct requested.source_media_id)::integer
  into v_requested_count
  from jsonb_to_recordset(p_assets) as requested(
    source_media_id uuid,
    source_bucket text,
    source_path text,
    source_fingerprint text,
    storage_path text,
    public_url text,
    content_type text,
    byte_size bigint
  );

  if v_expected_count = 0 or v_requested_count <> v_expected_count then
    raise exception 'Every public image and floor plan must have one durable website asset.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_assets) as requested(
      source_media_id uuid,
      source_bucket text,
      source_path text,
      source_fingerprint text,
      storage_path text,
      public_url text,
      content_type text,
      byte_size bigint
    )
    left join public.listing_media media
      on media.id = requested.source_media_id
      and media.listing_id = p_listing_id
      and media.media_type in ('image', 'floor_plan')
    where media.id is null
      or nullif(trim(requested.source_bucket), '') is null
      or nullif(trim(requested.source_path), '') is null
      or nullif(trim(requested.source_fingerprint), '') is null
      or requested.storage_path not like (
        'organisations/' || v_listing.organisation_id::text ||
        '/websites/' || v_site.id::text ||
        '/listings/' || p_listing_id::text || '/%'
      )
      or requested.public_url not like (
        '%/storage/v1/object/public/listing-media/' || requested.storage_path
      )
      or requested.byte_size is null
      or requested.byte_size <= 0
      or requested.byte_size > 15728640
      or (
        requested.content_type !~* '^image/'
        and not (media.media_type = 'floor_plan' and requested.content_type = 'application/pdf')
      )
  ) then
    raise exception 'One or more durable website media assets are invalid.' using errcode = '23514';
  end if;

  insert into public.website_listing_media_assets (
    website_site_id,
    listing_id,
    source_media_id,
    media_type,
    source_bucket,
    source_path,
    source_fingerprint,
    storage_path,
    public_url,
    content_type,
    byte_size,
    status,
    published_at,
    retired_at,
    deleted_at,
    created_by,
    updated_by
  )
  select
    v_site.id,
    p_listing_id,
    media.id,
    media.media_type,
    trim(requested.source_bucket),
    trim(requested.source_path),
    trim(requested.source_fingerprint),
    trim(requested.storage_path),
    trim(requested.public_url),
    lower(trim(requested.content_type)),
    requested.byte_size,
    'active',
    now(),
    null,
    null,
    p_actor_id,
    p_actor_id
  from jsonb_to_recordset(p_assets) as requested(
    source_media_id uuid,
    source_bucket text,
    source_path text,
    source_fingerprint text,
    storage_path text,
    public_url text,
    content_type text,
    byte_size bigint
  )
  join public.listing_media media on media.id = requested.source_media_id
  on conflict (website_site_id, source_media_id) do update
  set source_bucket = excluded.source_bucket,
      source_path = excluded.source_path,
      source_fingerprint = excluded.source_fingerprint,
      storage_path = excluded.storage_path,
      public_url = excluded.public_url,
      content_type = excluded.content_type,
      byte_size = excluded.byte_size,
      status = 'active',
      published_at = now(),
      retired_at = null,
      deleted_at = null,
      updated_by = p_actor_id;

  update public.website_listing_media_assets asset
  set status = 'retired',
      retired_at = coalesce(asset.retired_at, now()),
      updated_by = p_actor_id
  where asset.website_site_id = v_site.id
    and asset.listing_id = p_listing_id
    and asset.status = 'active'
    and not exists (
      select 1
      from jsonb_to_recordset(p_assets) as requested(source_media_id uuid)
      where requested.source_media_id = asset.source_media_id
    );

  select count(*)::integer
  into v_active_count
  from public.website_listing_media_assets asset
  where asset.website_site_id = v_site.id
    and asset.listing_id = p_listing_id
    and asset.status = 'active';

  return jsonb_build_object(
    'listingId', p_listing_id,
    'websiteSiteId', v_site.id,
    'activeAssetCount', v_active_count,
    'expectedAssetCount', v_expected_count
  );
end;
$$;

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
  v_durable_image_count integer := 0;
  v_media_updated_at timestamptz;
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

  select count(*)::integer, max(media.updated_at)
  into v_image_count, v_media_updated_at
  from public.listing_media media
  where media.listing_id = v_listing.id
    and media.media_type = 'image'
    and media.file_url ~* '^https://[^[:space:]]+$';

  if v_image_count = 0 then
    v_blockers := v_blockers || to_jsonb('Add at least one public HTTPS listing image.'::text);
  end if;

  if v_site.id is not null then
    select count(*)::integer
    into v_durable_image_count
    from public.website_listing_media_assets asset
    join public.listing_media media on media.id = asset.source_media_id
    where asset.website_site_id = v_site.id
      and asset.listing_id = v_listing.id
      and asset.status = 'active'
      and media.listing_id = v_listing.id
      and media.media_type = 'image';

    if v_image_count > v_durable_image_count then
      v_blockers := v_blockers || to_jsonb('Prepare durable website copies for every listing image.'::text);
    end if;

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
    'durableImageCount', v_durable_image_count,
    'stale', coalesce(
      v_channel.status = 'published'
      and (
        v_projection.updated_at > v_channel.last_synced_at
        or v_media_updated_at > v_channel.last_synced_at
        or v_image_count <> v_durable_image_count
      ),
      false
    ),
    'publishedAt', v_channel.published_at,
    'unpublishedAt', v_channel.unpublished_at,
    'lastSyncedAt', v_channel.last_synced_at
  );
end;
$$;

create or replace function public.website_commit_listing_publication(
  p_listing_id uuid,
  p_action text,
  p_actor_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := p_actor_id;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_listing public.private_listings%rowtype;
  v_site public.website_sites%rowtype;
  v_projection public.listing_publication_data%rowtype;
  v_existing public.website_listing_publications%rowtype;
  v_source_asset_count integer := 0;
  v_durable_asset_count integer := 0;
  v_publication_json jsonb;
  v_media_json jsonb;
begin
  if v_user_id is null then
    raise exception 'A verified actor is required to manage website publication.' using errcode = '42501';
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

  if not exists (
    select 1
    from public.organisation_users member
    where member.organisation_id = v_listing.organisation_id
      and (
        member.user_id = p_actor_id
        or (
          member.user_id is null
          and nullif(lower(trim(member.email)), '') is not null
          and lower(trim(member.email)) = lower(trim(coalesce(p_actor_email, '')))
        )
      )
      and lower(trim(coalesce(member.membership_status, member.status, ''))) in ('active', 'accepted')
  ) then
    raise exception 'This listing is outside the actor''s active organisation.' using errcode = '42501';
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

    update public.website_listing_media_assets asset
    set status = 'retired',
        retired_at = coalesce(asset.retired_at, now()),
        updated_by = v_user_id
    where asset.website_site_id = v_site.id
      and asset.listing_id = v_listing.id
      and asset.status = 'active';

    return jsonb_build_object(
      'listingId', v_listing.id,
      'websiteSiteId', v_site.id,
      'status', 'unpublished'
    );
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
  into v_source_asset_count
  from public.listing_media media
  where media.listing_id = v_listing.id
    and media.media_type in ('image', 'floor_plan')
    and media.file_url ~* '^https://[^[:space:]]+$';

  if v_source_asset_count = 0 then
    raise exception 'At least one public HTTPS listing image is required.' using errcode = '23514';
  end if;

  select count(*)::integer
  into v_durable_asset_count
  from public.website_listing_media_assets asset
  join public.listing_media media on media.id = asset.source_media_id
  where asset.website_site_id = v_site.id
    and asset.listing_id = v_listing.id
    and asset.status = 'active'
    and media.listing_id = v_listing.id
    and media.media_type in ('image', 'floor_plan');

  if v_durable_asset_count <> v_source_asset_count then
    raise exception 'Prepare durable website media before publishing or updating this listing.' using errcode = '23514';
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

  select coalesce(jsonb_agg(media_row.payload order by media_row.sort_order, media_row.source_media_id), '[]'::jsonb)
  into v_media_json
  from (
    select
      source.id as source_media_id,
      source.sort_order,
      jsonb_strip_nulls(jsonb_build_object(
        'media_type', source.media_type,
        'file_url', asset.public_url,
        'caption', source.caption,
        'sort_order', source.sort_order
      )) as payload
    from public.website_listing_media_assets asset
    join public.listing_media source on source.id = asset.source_media_id
    where asset.website_site_id = v_site.id
      and asset.listing_id = v_listing.id
      and asset.status = 'active'
      and source.listing_id = v_listing.id
      and source.media_type in ('image', 'floor_plan')

    union all

    select
      source.id,
      source.sort_order,
      jsonb_strip_nulls(jsonb_build_object(
        'media_type', source.media_type,
        'file_url', source.file_url,
        'caption', source.caption,
        'sort_order', source.sort_order
      ))
    from public.listing_media source
    where source.listing_id = v_listing.id
      and source.media_type in ('video', 'virtual_tour')
      and source.file_url ~* '^https://[^[:space:]]+$'
  ) media_row;

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

  return jsonb_build_object(
    'listingId', v_listing.id,
    'websiteSiteId', v_site.id,
    'status', 'published'
  );
end;
$$;

revoke all on function public.website_register_listing_media_assets(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.website_register_listing_media_assets(uuid, uuid, text, jsonb) to service_role;

revoke all on function public.website_get_listing_publication_status(uuid) from public, anon;
grant execute on function public.website_get_listing_publication_status(uuid) to authenticated;
revoke all on function public.website_commit_listing_publication(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.website_commit_listing_publication(uuid, text, uuid, text) to service_role;
drop function if exists public.website_set_listing_publication(uuid, text);

comment on table public.website_listing_media_assets is
  'Tenant-scoped durable public copies of CRM listing media owned by the website publication lifecycle.';
comment on function public.website_register_listing_media_assets(uuid, uuid, text, jsonb) is
  'Service-only atomic registration and retirement of immutable public website media copies.';
comment on function public.website_commit_listing_publication(uuid, text, uuid, text) is
  'Service-only publication commit that accepts only verified actors and durable website media snapshots.';

notify pgrst, 'reload schema';

commit;
