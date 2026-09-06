begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organisation-branding',
  'organisation-branding',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.website_brand_assets (
  id uuid primary key default gen_random_uuid(),
  website_site_id uuid not null references public.website_sites(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  variant text not null check (variant in ('light', 'dark')),
  source_bucket text not null,
  source_path text not null,
  source_fingerprint text not null check (source_fingerprint ~* '^[0-9a-f]{64}$'),
  storage_bucket text not null default 'organisation-branding' check (storage_bucket = 'organisation-branding'),
  storage_path text not null,
  public_url text not null check (public_url ~* '^https://[^[:space:]]+$'),
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  status text not null default 'active' check (status in ('active', 'retired', 'deleted')),
  retired_at timestamptz,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint website_brand_assets_site_organisation_fkey
    foreign key (website_site_id, organisation_id)
    references public.website_sites(id, organisation_id)
    on delete cascade,
  constraint website_brand_assets_content_unique
    unique (website_site_id, variant, source_fingerprint),
  constraint website_brand_assets_storage_unique
    unique (storage_bucket, storage_path)
);

create index if not exists website_brand_assets_site_status_idx
  on public.website_brand_assets (website_site_id, status, updated_at desc);

drop trigger if exists trg_website_brand_assets_updated_at on public.website_brand_assets;
create trigger trg_website_brand_assets_updated_at
before update on public.website_brand_assets
for each row execute function public.set_updated_at_timestamp();

alter table public.website_brand_assets enable row level security;
revoke all on table public.website_brand_assets from public, anon, authenticated;
grant select, insert, update, delete on table public.website_brand_assets to service_role;

create or replace function public.website_commit_draft_brand(
  p_website_site_id uuid,
  p_revision_id uuid,
  p_actor_id uuid,
  p_actor_email text,
  p_brand_patch jsonb,
  p_assets jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site public.website_sites%rowtype;
  v_current_brand jsonb;
  v_next_brand jsonb;
  v_key text;
  v_value text;
  v_variant text;
  v_public_url text;
  v_logo_light_url text;
  v_logo_dark_url text;
  v_asset record;
  v_retired_assets jsonb := '[]'::jsonb;
begin
  if p_actor_id is null then
    raise exception 'A verified actor is required to edit website branding.' using errcode = '42501';
  end if;
  if p_brand_patch is null or jsonb_typeof(p_brand_patch) <> 'object' then
    raise exception 'Website branding must be a JSON object.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_assets, 'null'::jsonb)) <> 'array' then
    raise exception 'Website brand assets must be supplied as an array.' using errcode = '22023';
  end if;
  if (p_brand_patch - array[
    'name', 'logoLightUrl', 'logoDarkUrl', 'primaryColor', 'secondaryColor',
    'accentColor', 'phone', 'email', 'website', 'whatsappNumber'
  ]) <> '{}'::jsonb then
    raise exception 'Website branding contains unsupported fields.' using errcode = '22023';
  end if;
  foreach v_value in array array[
    'name', 'logoLightUrl', 'logoDarkUrl', 'primaryColor', 'secondaryColor',
    'accentColor', 'phone', 'email', 'website', 'whatsappNumber'
  ] loop
    if p_brand_patch ? v_value and jsonb_typeof(p_brand_patch -> v_value) <> 'string' then
      raise exception '% must be a text value.', v_value using errcode = '22023';
    end if;
  end loop;

  select site.* into v_site
  from public.website_sites site
  where site.id = p_website_site_id;
  if not found then
    raise exception 'Website site not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.organisation_users member
    left join public.profiles profile on profile.id = p_actor_id
    where member.organisation_id = v_site.organisation_id
      and (
        member.user_id = p_actor_id
        or (
          member.user_id is null
          and nullif(lower(trim(member.email)), '') is not null
          and lower(trim(member.email)) = lower(trim(coalesce(p_actor_email, '')))
        )
      )
      and lower(trim(coalesce(member.membership_status, member.status, ''))) in ('active', 'accepted')
      and lower(trim(coalesce(
        member.workspace_role,
        member.organization_role,
        member.organisation_role,
        member.role,
        profile.role,
        ''
      ))) in (
        'super_admin', 'superadmin', 'principal', 'owner', 'admin',
        'administrator', 'developer', 'director', 'partner', 'founder',
        'platform_admin', 'branch_manager', 'branch manager', 'branch_admin'
      )
  ) then
    raise exception 'Only organisation administrators can edit website branding.' using errcode = '42501';
  end if;

  select revision.brand_json into v_current_brand
  from public.website_site_revisions revision
  where revision.id = p_revision_id
    and revision.website_site_id = v_site.id
    and revision.status = 'draft'
  for update;
  if not found then
    raise exception 'An editable website draft was not found.' using errcode = 'P0002';
  end if;

  for v_asset in
    select requested.*
    from jsonb_to_recordset(p_assets) as requested(
      variant text,
      source_bucket text,
      source_path text,
      source_fingerprint text,
      storage_path text,
      public_url text,
      content_type text,
      byte_size bigint
    )
  loop
    if v_asset.variant not in ('light', 'dark')
      or nullif(trim(v_asset.source_bucket), '') is null
      or nullif(trim(v_asset.source_path), '') is null
      or coalesce(v_asset.source_fingerprint, '') !~* '^[0-9a-f]{64}$'
      or v_asset.storage_path not like (
        'organisations/' || v_site.organisation_id::text ||
        '/websites/' || v_site.id::text ||
        '/branding/' || v_asset.variant || '/%'
      )
      or v_asset.public_url not like (
        '%/storage/v1/object/public/organisation-branding/' || v_asset.storage_path
      )
      or v_asset.content_type not in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')
      or v_asset.byte_size is null
      or v_asset.byte_size <= 0
      or v_asset.byte_size > 10485760 then
      raise exception 'One or more durable website brand assets are invalid.' using errcode = '23514';
    end if;

    insert into public.website_brand_assets (
      website_site_id, organisation_id, variant, source_bucket, source_path,
      source_fingerprint, storage_path, public_url, content_type, byte_size,
      status, retired_at, deleted_at, created_by, updated_by
    ) values (
      v_site.id, v_site.organisation_id, v_asset.variant,
      trim(v_asset.source_bucket), trim(v_asset.source_path),
      lower(trim(v_asset.source_fingerprint)), trim(v_asset.storage_path),
      trim(v_asset.public_url), lower(trim(v_asset.content_type)), v_asset.byte_size,
      'active', null, null, p_actor_id, p_actor_id
    )
    on conflict (website_site_id, variant, source_fingerprint) do update
    set source_bucket = excluded.source_bucket,
        source_path = excluded.source_path,
        storage_path = excluded.storage_path,
        public_url = excluded.public_url,
        content_type = excluded.content_type,
        byte_size = excluded.byte_size,
        status = 'active',
        retired_at = null,
        deleted_at = null,
        updated_by = p_actor_id;
  end loop;

  v_next_brand := coalesce(v_current_brand, '{}'::jsonb);

  if p_brand_patch ? 'name' then
    v_value := left(trim(p_brand_patch ->> 'name'), 160);
    if v_value = '' then raise exception 'Company display name is required.' using errcode = '22023'; end if;
    v_next_brand := jsonb_set(v_next_brand, '{name}', to_jsonb(v_value), true);
  end if;

  foreach v_value in array array['primaryColor', 'secondaryColor', 'accentColor'] loop
    if p_brand_patch ? v_value then
      if lower(trim(p_brand_patch ->> v_value)) !~ '^#[0-9a-f]{6}$' then
        raise exception '% must be a six-digit hex colour.', v_value using errcode = '22023';
      end if;
      v_next_brand := jsonb_set(
        v_next_brand,
        array[v_value],
        to_jsonb(lower(trim(p_brand_patch ->> v_value))),
        true
      );
    end if;
  end loop;

  foreach v_key in array array['logoLightUrl', 'logoDarkUrl'] loop
    if p_brand_patch ? v_key then
      if nullif(trim(p_brand_patch ->> v_key), '') is null then
        v_next_brand := v_next_brand - v_key;
      else
        v_variant := case when v_key = 'logoLightUrl' then 'light' else 'dark' end;
        v_public_url := null;
        select asset.public_url into v_public_url
        from public.website_brand_assets asset
        where asset.website_site_id = v_site.id
          and asset.organisation_id = v_site.organisation_id
          and asset.variant = v_variant
          and asset.status = 'active'
          and asset.public_url = trim(p_brand_patch ->> v_key)
          and asset.public_url in (
            select requested.public_url
            from jsonb_to_recordset(p_assets) as requested(public_url text)
          )
        order by asset.updated_at desc
        limit 1;
        if v_public_url is null then
          raise exception '% must reference a registered durable website logo.', v_key using errcode = '23514';
        end if;
        v_next_brand := jsonb_set(v_next_brand, array[v_key], to_jsonb(v_public_url), true);
      end if;
    end if;
  end loop;

  if p_brand_patch ? 'email' then
    v_value := lower(trim(p_brand_patch ->> 'email'));
    if v_value = '' then
      v_next_brand := v_next_brand - 'email';
    elsif length(v_value) > 254 or v_value !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
      raise exception 'Contact email must be valid.' using errcode = '22023';
    else
      v_next_brand := jsonb_set(v_next_brand, '{email}', to_jsonb(v_value), true);
    end if;
  end if;

  if p_brand_patch ? 'website' then
    v_value := trim(p_brand_patch ->> 'website');
    if v_value = '' then
      v_next_brand := v_next_brand - 'website';
    elsif length(v_value) > 2048 or v_value !~* '^https://[^[:space:]]+$' then
      raise exception 'Company website must be a valid HTTPS URL.' using errcode = '22023';
    else
      v_next_brand := jsonb_set(v_next_brand, '{website}', to_jsonb(v_value), true);
    end if;
  end if;

  foreach v_value in array array['phone', 'whatsappNumber'] loop
    if p_brand_patch ? v_value then
      if nullif(trim(p_brand_patch ->> v_value), '') is null then
        v_next_brand := v_next_brand - v_value;
      elsif length(trim(p_brand_patch ->> v_value)) > 64 then
        raise exception '% is too long.', v_value using errcode = '22023';
      else
        v_next_brand := jsonb_set(v_next_brand, array[v_value], to_jsonb(trim(p_brand_patch ->> v_value)), true);
      end if;
    end if;
  end loop;

  v_logo_light_url := nullif(v_next_brand ->> 'logoLightUrl', '');
  v_logo_dark_url := nullif(v_next_brand ->> 'logoDarkUrl', '');
  if coalesce(v_logo_dark_url, v_logo_light_url) is null then
    v_next_brand := v_next_brand - 'logoUrl';
  else
    v_next_brand := jsonb_set(v_next_brand, '{logoUrl}', to_jsonb(coalesce(v_logo_dark_url, v_logo_light_url)), true);
  end if;
  v_next_brand := jsonb_set(v_next_brand, '{updatedAt}', to_jsonb(now()), true);
  v_next_brand := jsonb_set(v_next_brand, '{updatedBy}', to_jsonb(p_actor_id), true);

  update public.website_site_revisions revision
  set brand_json = jsonb_strip_nulls(v_next_brand), updated_at = now()
  where revision.id = p_revision_id;

  update public.website_brand_assets asset
  set status = 'retired', retired_at = coalesce(asset.retired_at, now()), updated_by = p_actor_id
  where asset.website_site_id = v_site.id
    and asset.status = 'active'
    and not exists (
      select 1
      from public.website_site_revisions revision
      where revision.website_site_id = v_site.id
        and asset.public_url in (
          revision.brand_json ->> 'logoLightUrl',
          revision.brand_json ->> 'logoDarkUrl',
          revision.brand_json ->> 'logoUrl'
        )
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', asset.id,
    'storagePath', asset.storage_path
  ) order by asset.storage_path), '[]'::jsonb)
  into v_retired_assets
  from public.website_brand_assets asset
  where asset.website_site_id = v_site.id
    and asset.status = 'retired';

  return jsonb_build_object(
    'websiteSiteId', v_site.id,
    'revisionId', p_revision_id,
    'brand', jsonb_strip_nulls(v_next_brand),
    'retiredAssets', v_retired_assets
  );
end;
$$;

do $$
begin
  if to_regprocedure('public.website_revision_readiness_base(uuid,uuid)') is null then
    alter function public.website_revision_readiness(uuid, uuid)
      rename to website_revision_readiness_base;
  end if;
end;
$$;

create or replace function public.website_revision_readiness(
  p_website_site_id uuid,
  p_revision_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_revision public.website_site_revisions%rowtype;
  v_blockers jsonb;
  v_logo_url text;
  v_variant text;
begin
  v_result := public.website_revision_readiness_base(p_website_site_id, p_revision_id);
  select revision.* into v_revision
  from public.website_site_revisions revision
  where revision.id = p_revision_id
    and revision.website_site_id = p_website_site_id;

  v_blockers := coalesce(v_result -> 'blockers', '[]'::jsonb);
  if v_revision.status = 'draft' then
    foreach v_variant in array array['light', 'dark'] loop
      v_logo_url := nullif(trim(v_revision.brand_json ->> case when v_variant = 'light' then 'logoLightUrl' else 'logoDarkUrl' end), '');
      if v_logo_url is not null and not exists (
        select 1
        from public.website_brand_assets asset
        where asset.website_site_id = p_website_site_id
          and asset.variant = v_variant
          and asset.public_url = v_logo_url
          and asset.status = 'active'
      ) then
        v_blockers := v_blockers || to_jsonb(
          ('Prepare the ' || v_variant || ' website logo as a durable public asset before publishing.')::text
        );
      end if;
    end loop;
  end if;

  v_result := jsonb_set(v_result, '{blockers}', v_blockers, true);
  v_result := jsonb_set(v_result, '{ready}', to_jsonb(jsonb_array_length(v_blockers) = 0), true);
  return v_result;
end;
$$;

revoke all on function public.website_commit_draft_brand(uuid, uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.website_commit_draft_brand(uuid, uuid, uuid, text, jsonb, jsonb) to service_role;
revoke all on function public.website_revision_readiness_base(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.website_revision_readiness(uuid, uuid) from public, anon;
grant execute on function public.website_revision_readiness(uuid, uuid) to authenticated;
drop function if exists public.website_update_draft_brand(uuid, uuid, jsonb, boolean);

comment on table public.website_brand_assets is
  'Tenant-scoped immutable public logo copies retained while any website revision references them.';
comment on function public.website_commit_draft_brand(uuid, uuid, uuid, text, jsonb, jsonb) is
  'Service-only website brand commit that accepts verified administrators and registered durable logo assets.';

notify pgrst, 'reload schema';
commit;
