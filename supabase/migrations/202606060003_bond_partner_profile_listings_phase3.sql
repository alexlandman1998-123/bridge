begin;

alter table public.partner_visibility_permissions
  drop constraint if exists partner_visibility_permissions_key_check;

alter table public.partner_visibility_permissions
  add constraint partner_visibility_permissions_key_check check (
    permission_key in (
      'can_view_principal',
      'can_view_branch_managers',
      'can_view_agents',
      'can_view_listings'
    )
  );

create table if not exists public.partner_shared_resources (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.organisation_partners(id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  shared_by uuid references auth.users(id) on delete set null,
  shared_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_shared_resources_resource_type_check check (
    resource_type in ('listing', 'development', 'lead', 'application', 'campaign', 'report')
  ),
  constraint partner_shared_resources_unique_resource unique (relationship_id, resource_type, resource_id)
);

create index if not exists partner_shared_resources_relationship_idx
  on public.partner_shared_resources (relationship_id, resource_type, is_active);

create index if not exists partner_shared_resources_resource_idx
  on public.partner_shared_resources (resource_type, resource_id);

drop trigger if exists trg_partner_shared_resources_updated_at on public.partner_shared_resources;
create trigger trg_partner_shared_resources_updated_at
before update on public.partner_shared_resources
for each row
execute function public.set_updated_at_timestamp();

alter table public.partner_shared_resources enable row level security;

drop policy if exists partner_shared_resources_select_related_orgs on public.partner_shared_resources;
create policy partner_shared_resources_select_related_orgs
on public.partner_shared_resources
for select to authenticated
using (
  exists (
    select 1
    from public.organisation_partners op
    where op.id = partner_shared_resources.relationship_id
      and (
        public.bridge_is_active_member(op.organisation_id)
        or public.bridge_is_active_member(op.partner_organisation_id)
      )
  )
);

drop policy if exists partner_shared_resources_manage_listing_owner on public.partner_shared_resources;
create policy partner_shared_resources_manage_listing_owner
on public.partner_shared_resources
for all to authenticated
using (
  resource_type = 'listing'
  and exists (
    select 1
    from public.organisation_partners op
    join public.private_listings pl
      on pl.id = partner_shared_resources.resource_id
     and pl.organisation_id in (op.organisation_id, op.partner_organisation_id)
    where op.id = partner_shared_resources.relationship_id
      and (
        public.bridge_is_org_admin(pl.organisation_id)
        or pl.assigned_agent_id = auth.uid()
        or pl.created_by = auth.uid()
      )
  )
)
with check (
  resource_type = 'listing'
  and exists (
    select 1
    from public.organisation_partners op
    join public.private_listings pl
      on pl.id = partner_shared_resources.resource_id
     and pl.organisation_id in (op.organisation_id, op.partner_organisation_id)
    where op.id = partner_shared_resources.relationship_id
      and (
        public.bridge_is_org_admin(pl.organisation_id)
        or pl.assigned_agent_id = auth.uid()
        or pl.created_by = auth.uid()
      )
  )
);

create or replace function public.get_bond_partner_listings_phase3(p_relationship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relationship public.organisation_partners%rowtype;
  v_current_organisation_id uuid;
  v_partner_organisation_id uuid;
  v_relationship_status text;
  v_can_view_listings boolean := false;
  v_listings jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or p_relationship_id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  select *
    into v_relationship
    from public.organisation_partners
   where id = p_relationship_id
   limit 1;

  if not found then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  select ou.organisation_id
    into v_current_organisation_id
    from public.organisation_users ou
   where ou.user_id = auth.uid()
     and coalesce(ou.status, 'active') = 'active'
     and ou.organisation_id in (v_relationship.organisation_id, v_relationship.partner_organisation_id)
   order by ou.active_workspace_selected_at desc nulls last, ou.updated_at desc nulls last
   limit 1;

  if v_current_organisation_id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  v_relationship_status := coalesce(nullif(v_relationship.status, ''), nullif(v_relationship.relationship_status, ''), 'pending');

  if v_relationship_status <> 'accepted' then
    return jsonb_build_object('error_code', 'not_accepted');
  end if;

  v_partner_organisation_id := case
    when v_relationship.organisation_id = v_current_organisation_id then v_relationship.partner_organisation_id
    else v_relationship.organisation_id
  end;

  select exists (
    select 1
    from public.partner_visibility_permissions pvp
    where pvp.relationship_id = p_relationship_id
      and pvp.permission_key = 'can_view_listings'
      and pvp.is_enabled is true
  )
  into v_can_view_listings;

  if v_can_view_listings then
    select coalesce(jsonb_agg(listing_payload order by (listing_payload->>'created_at') desc nulls last), '[]'::jsonb)
      into v_listings
      from (
        select jsonb_build_object(
          'listing_id', pl.id,
          'listing_reference', coalesce(nullif(pl.listing_reference, ''), pl.id::text),
          'title', coalesce(nullif(lpd.title, ''), nullif(pl.title, ''), nullif(pl.address_line_1, ''), 'Shared listing'),
          'property_type', coalesce(nullif(lpd.property_type, ''), nullif(pl.property_type, ''), 'Property'),
          'status', coalesce(nullif(lpd.status, ''), nullif(pl.listing_status, ''), 'active'),
          'price', coalesce(lpd.asking_price, pl.asking_price, 0),
          'suburb', coalesce(nullif(lpd.suburb, ''), nullif(pl.suburb, '')),
          'city', nullif(pl.city, ''),
          'branch_name', nullif(ob.name, ''),
          'agent_name', coalesce(
            nullif(pr.full_name, ''),
            nullif(trim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
            'Assigned agent'
          ),
          'main_image', cover_media.file_url,
          'bedrooms', coalesce(lpd.bedrooms::numeric, 0),
          'bathrooms', coalesce(lpd.bathrooms, 0),
          'parking', coalesce(lpd.parking_bays, lpd.garages, 0),
          'created_at', pl.created_at,
          'publication_statuses', jsonb_build_object(
            'bridge', coalesce(nullif(pl.bridge_listing_status, ''), 'not_published'),
            'property24', coalesce(nullif(pl.property24_status, ''), external_status.property24, 'not_published'),
            'private_property', coalesce(nullif(pl.private_property_status, ''), external_status.private_property, 'not_published'),
            'website', coalesce(external_status.website, 'not_published')
          )
        ) as listing_payload
        from public.partner_shared_resources psr
        join public.private_listings pl
          on pl.id = psr.resource_id
         and pl.organisation_id = v_partner_organisation_id
        left join public.listing_publication_data lpd on lpd.listing_id = pl.id
        left join public.organisation_branches ob
          on ob.id = pl.branch_id
         and ob.organisation_id = pl.organisation_id
        left join public.profiles pr on pr.id = pl.assigned_agent_id
        left join lateral (
          select lm.file_url
          from public.listing_media lm
          where lm.listing_id = pl.id
            and lm.media_type = 'image'
          order by lm.is_cover desc, lm.sort_order asc, lm.created_at asc
          limit 1
        ) cover_media on true
        left join lateral (
          select
            max(le.status) filter (where lower(le.platform) like '%property24%') as property24,
            max(le.status) filter (where lower(le.platform) like '%private%property%') as private_property,
            max(le.status) filter (where lower(le.platform) in ('website', 'agency website', 'web')) as website
          from public.listing_external_links le
          where le.listing_id = pl.id
        ) external_status on true
        where psr.relationship_id = p_relationship_id
          and psr.resource_type = 'listing'
          and psr.is_active is true
          and coalesce(pl.listing_status, 'active') not in ('withdrawn')
          and coalesce(pl.listing_visibility, 'internal') <> 'archived'
      ) rows;
  end if;

  return jsonb_build_object(
    'relationship_id', p_relationship_id,
    'partner_organisation_id', v_partner_organisation_id,
    'permissions', jsonb_build_object('can_view_listings', v_can_view_listings),
    'listings', v_listings
  );
end;
$$;

create or replace function public.get_listing_partner_share_options_phase3(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.private_listings%rowtype;
  v_options jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or p_listing_id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  select *
    into v_listing
    from public.private_listings
   where id = p_listing_id
   limit 1;

  if not found then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  if not (
    public.bridge_is_org_admin(v_listing.organisation_id)
    or v_listing.assigned_agent_id = auth.uid()
    or v_listing.created_by = auth.uid()
  ) then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  select coalesce(jsonb_agg(option_payload order by option_payload->>'partner_name'), '[]'::jsonb)
    into v_options
    from (
      select jsonb_build_object(
        'relationship_id', op.id,
        'partner_organisation_id', partner_org.id,
        'partner_name', partner_org.name,
        'partner_type', partner_org.type,
        'relationship_type', op.relationship_type,
        'is_shared', exists (
          select 1
          from public.partner_shared_resources psr
          where psr.relationship_id = op.id
            and psr.resource_type = 'listing'
            and psr.resource_id = p_listing_id
            and psr.is_active is true
        )
      ) as option_payload
      from public.organisation_partners op
      join public.organisations partner_org
        on partner_org.id = case
          when op.organisation_id = v_listing.organisation_id then op.partner_organisation_id
          else op.organisation_id
        end
      where coalesce(nullif(op.status, ''), nullif(op.relationship_status, ''), 'pending') = 'accepted'
        and v_listing.organisation_id in (op.organisation_id, op.partner_organisation_id)
    ) rows;

  return jsonb_build_object(
    'listing_id', p_listing_id,
    'organisation_id', v_listing.organisation_id,
    'options', v_options
  );
end;
$$;

create or replace function public.share_partner_listing_phase3(
  p_relationship_id uuid,
  p_listing_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relationship public.organisation_partners%rowtype;
  v_listing public.private_listings%rowtype;
  v_relationship_status text;
begin
  if auth.uid() is null or p_relationship_id is null or p_listing_id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  select *
    into v_relationship
    from public.organisation_partners
   where id = p_relationship_id
   limit 1;

  select *
    into v_listing
    from public.private_listings
   where id = p_listing_id
   limit 1;

  if not found or v_relationship.id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  v_relationship_status := coalesce(nullif(v_relationship.status, ''), nullif(v_relationship.relationship_status, ''), 'pending');

  if v_relationship_status <> 'accepted' then
    return jsonb_build_object('error_code', 'not_accepted');
  end if;

  if v_listing.organisation_id not in (v_relationship.organisation_id, v_relationship.partner_organisation_id) then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  if not (
    public.bridge_is_org_admin(v_listing.organisation_id)
    or v_listing.assigned_agent_id = auth.uid()
    or v_listing.created_by = auth.uid()
  ) then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  insert into public.partner_shared_resources (
    relationship_id,
    resource_type,
    resource_id,
    shared_by,
    shared_at,
    is_active
  )
  values (
    p_relationship_id,
    'listing',
    p_listing_id,
    auth.uid(),
    now(),
    true
  )
  on conflict (relationship_id, resource_type, resource_id)
  do update set
    shared_by = excluded.shared_by,
    shared_at = excluded.shared_at,
    is_active = true,
    updated_at = now();

  return jsonb_build_object('relationship_id', p_relationship_id, 'listing_id', p_listing_id, 'is_shared', true);
end;
$$;

create or replace function public.unshare_partner_listing_phase3(
  p_relationship_id uuid,
  p_listing_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_relationship public.organisation_partners%rowtype;
  v_listing public.private_listings%rowtype;
begin
  if auth.uid() is null or p_relationship_id is null or p_listing_id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  select *
    into v_relationship
    from public.organisation_partners
   where id = p_relationship_id
   limit 1;

  select *
    into v_listing
    from public.private_listings
   where id = p_listing_id
   limit 1;

  if not found or v_relationship.id is null then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  if v_listing.organisation_id not in (v_relationship.organisation_id, v_relationship.partner_organisation_id) then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  if not (
    public.bridge_is_org_admin(v_listing.organisation_id)
    or v_listing.assigned_agent_id = auth.uid()
    or v_listing.created_by = auth.uid()
  ) then
    return jsonb_build_object('error_code', 'not_found');
  end if;

  update public.partner_shared_resources
     set is_active = false,
         updated_at = now()
   where relationship_id = p_relationship_id
     and resource_type = 'listing'
     and resource_id = p_listing_id;

  return jsonb_build_object('relationship_id', p_relationship_id, 'listing_id', p_listing_id, 'is_shared', false);
end;
$$;

grant select, insert, update, delete on public.partner_shared_resources to authenticated;
grant execute on function public.get_bond_partner_listings_phase3(uuid) to authenticated;
grant execute on function public.get_listing_partner_share_options_phase3(uuid) to authenticated;
grant execute on function public.share_partner_listing_phase3(uuid, uuid) to authenticated;
grant execute on function public.unshare_partner_listing_phase3(uuid, uuid) to authenticated;

commit;
