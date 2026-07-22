begin;

create or replace function public.bridge_normalize_partner_role_type(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(regexp_replace(trim(coalesce(p_value, '')), '[ -]+', '_', 'g'))
    when 'attorney' then 'transfer_attorney'
    when 'attorney_firm' then 'transfer_attorney'
    when 'conveyancer' then 'transfer_attorney'
    when 'transfer' then 'transfer_attorney'
    when 'bond' then 'bond_originator'
    when 'originator' then 'bond_originator'
    when 'personal_originator' then 'bond_originator'
    when 'bond_company' then 'bond_originator'
    when 'agency' then 'referral_agency'
    when 'agency_network' then 'referral_agency'
    when 'referral_partner' then 'referral_agency'
    when 'developer_company' then 'developer'
    when 'development' then 'developer'
    when 'service_provider' then 'other'
    when 'internal_source' then 'other'
    when '' then 'other'
    else lower(regexp_replace(trim(coalesce(p_value, '')), '[ -]+', '_', 'g'))
  end
$$;

create or replace function public.bridge_partner_role_for_organisation(p_organisation_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.bridge_normalize_partner_role_type(
    coalesce(organisation.organization_type, organisation.type)
  )
  from public.organisations organisation
  where organisation.id = p_organisation_id
$$;

create table if not exists public.organisation_partner_roles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  relationship_id uuid references public.organisation_partners(id) on delete cascade,
  external_partner_id uuid references public.organisation_preferred_partners(id) on delete cascade,
  partner_organisation_id uuid references public.organisations(id) on delete cascade,
  role_type text not null,
  is_active boolean not null default true,
  is_preferred_default boolean not null default false,
  source text not null default 'manual',
  scope_type text not null default 'all_developments',
  scope_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_partner_roles_identity_check
    check (relationship_id is not null or external_partner_id is not null),
  constraint organisation_partner_roles_role_type_check
    check (role_type in (
      'transfer_attorney',
      'bond_attorney',
      'cancellation_attorney',
      'bond_originator',
      'referral_agency',
      'developer',
      'agent',
      'other'
    ))
);

create unique index if not exists organisation_partner_roles_relationship_role_idx
  on public.organisation_partner_roles (organisation_id, relationship_id, role_type)
  where relationship_id is not null;

create unique index if not exists organisation_partner_roles_external_role_idx
  on public.organisation_partner_roles (organisation_id, external_partner_id, role_type)
  where external_partner_id is not null;

create index if not exists organisation_partner_roles_partner_org_idx
  on public.organisation_partner_roles (organisation_id, partner_organisation_id, role_type)
  where partner_organisation_id is not null;

comment on table public.organisation_partner_roles is
  'Organisation-owned role, default, and scope configuration for an external partner or canonical relationship.';

create or replace function public.bridge_validate_partner_role_configuration()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_relationship public.organisation_partners%rowtype;
  v_external public.organisation_preferred_partners%rowtype;
begin
  new.role_type := public.bridge_normalize_partner_role_type(new.role_type);
  new.source := coalesce(nullif(trim(new.source), ''), 'manual');
  new.scope_type := coalesce(nullif(trim(new.scope_type), ''), 'all_developments');
  new.scope_json := coalesce(new.scope_json, '{}'::jsonb);
  new.is_preferred_default := new.is_active and new.is_preferred_default;
  new.updated_at := now();

  if new.relationship_id is not null then
    select * into v_relationship
    from public.organisation_partners
    where id = new.relationship_id;
    if v_relationship.id is null
       or new.organisation_id not in (v_relationship.organisation_id, v_relationship.partner_organisation_id) then
      raise exception 'Role configuration relationship does not belong to the owning organisation.' using errcode = '23514';
    end if;
    new.partner_organisation_id := case when new.organisation_id = v_relationship.organisation_id
      then v_relationship.partner_organisation_id else v_relationship.organisation_id end;
  end if;

  if new.external_partner_id is not null then
    select * into v_external
    from public.organisation_preferred_partners
    where id = new.external_partner_id;
    if v_external.id is null or v_external.organisation_id <> new.organisation_id then
      raise exception 'Role configuration external partner does not belong to the owning organisation.' using errcode = '23514';
    end if;
    if v_external.partner_organisation_id is not null then
      if new.partner_organisation_id is not null
         and new.partner_organisation_id <> v_external.partner_organisation_id then
        raise exception 'Role configuration identities point to different partner organisations.' using errcode = '23514';
      end if;
      new.partner_organisation_id := v_external.partner_organisation_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists partner_role_configuration_validate on public.organisation_partner_roles;
create trigger partner_role_configuration_validate
before insert or update on public.organisation_partner_roles
for each row execute function public.bridge_validate_partner_role_configuration();

create or replace function public.bridge_detach_partner_role_identity_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'organisation_preferred_partners' then
    update public.organisation_partner_roles
    set external_partner_id = null, updated_at = now()
    where external_partner_id = old.id
      and relationship_id is not null;
  elsif tg_table_name = 'organisation_partners' then
    update public.organisation_partner_roles
    set relationship_id = null, updated_at = now()
    where relationship_id = old.id
      and external_partner_id is not null;
  end if;
  return old;
end;
$$;

drop trigger if exists external_partner_role_identity_detach
  on public.organisation_preferred_partners;
create trigger external_partner_role_identity_detach
before delete on public.organisation_preferred_partners
for each row execute function public.bridge_detach_partner_role_identity_before_delete();

drop trigger if exists relationship_role_identity_detach
  on public.organisation_partners;
create trigger relationship_role_identity_detach
before delete on public.organisation_partners
for each row execute function public.bridge_detach_partner_role_identity_before_delete();

insert into public.organisation_partner_roles (
  organisation_id,
  relationship_id,
  external_partner_id,
  partner_organisation_id,
  role_type,
  is_active,
  is_preferred_default,
  source,
  scope_type,
  scope_json,
  metadata,
  created_at,
  updated_at
)
select
  external.organisation_id,
  relationship.id,
  external.id,
  external.partner_organisation_id,
  public.bridge_normalize_partner_role_type(external.partner_type),
  external.is_active,
  external.is_preferred_default,
  coalesce(nullif(trim(external.source), ''), 'manual'),
  coalesce(nullif(trim(external.scope_type), ''), 'all_developments'),
  coalesce(external.scope_json, '{}'::jsonb),
  jsonb_build_object('backfillSource', 'organisation_preferred_partners'),
  external.created_at,
  external.updated_at
from public.organisation_preferred_partners external
left join public.organisation_partners relationship
  on external.partner_organisation_id is not null
  and external.organisation_id in (relationship.organisation_id, relationship.partner_organisation_id)
  and external.partner_organisation_id in (relationship.organisation_id, relationship.partner_organisation_id)
on conflict (organisation_id, external_partner_id, role_type)
  where external_partner_id is not null
do update set
  relationship_id = coalesce(excluded.relationship_id, public.organisation_partner_roles.relationship_id),
  partner_organisation_id = coalesce(excluded.partner_organisation_id, public.organisation_partner_roles.partner_organisation_id),
  is_active = excluded.is_active,
  is_preferred_default = excluded.is_preferred_default,
  source = excluded.source,
  scope_type = excluded.scope_type,
  scope_json = excluded.scope_json,
  updated_at = greatest(public.organisation_partner_roles.updated_at, excluded.updated_at);

insert into public.organisation_partner_roles (
  organisation_id,
  relationship_id,
  partner_organisation_id,
  role_type,
  is_active,
  is_preferred_default,
  source,
  scope_type,
  scope_json,
  metadata,
  created_by,
  created_at,
  updated_at
)
select
  relationship.organisation_id,
  relationship.id,
  relationship.partner_organisation_id,
  public.bridge_normalize_partner_role_type(coalesce(
    nullif(trim(relationship.partner_type), ''),
    public.bridge_partner_role_for_organisation(relationship.partner_organisation_id)
  )),
  lower(coalesce(relationship.status, relationship.relationship_status, 'pending')) <> 'removed',
  relationship.organisation_preferred,
  'relationship_backfill',
  'all_developments',
  '{}'::jsonb,
  jsonb_build_object('backfillSource', 'organisation_partners', 'relationshipSide', 'organisation'),
  relationship.created_by,
  relationship.created_at,
  relationship.updated_at
from public.organisation_partners relationship
on conflict (organisation_id, relationship_id, role_type)
  where relationship_id is not null
do update set
  partner_organisation_id = excluded.partner_organisation_id,
  is_active = excluded.is_active,
  updated_at = greatest(public.organisation_partner_roles.updated_at, excluded.updated_at);

with ranked_defaults as (
  select
    id,
    row_number() over (
      partition by organisation_id, role_type
      order by
        case when external_partner_id is not null then 0 else 1 end,
        updated_at desc,
        created_at desc,
        id
    ) as preference_rank
  from public.organisation_partner_roles
  where is_active and is_preferred_default
)
update public.organisation_partner_roles role_config
set is_preferred_default = false,
    updated_at = now()
from ranked_defaults ranked
where role_config.id = ranked.id
  and ranked.preference_rank > 1;

create unique index if not exists organisation_partner_roles_default_role_idx
  on public.organisation_partner_roles (organisation_id, role_type)
  where is_active and is_preferred_default;

insert into public.organisation_partner_roles (
  organisation_id,
  relationship_id,
  partner_organisation_id,
  role_type,
  is_active,
  is_preferred_default,
  source,
  scope_type,
  scope_json,
  metadata,
  created_by,
  created_at,
  updated_at
)
select
  relationship.partner_organisation_id,
  relationship.id,
  relationship.organisation_id,
  public.bridge_partner_role_for_organisation(relationship.organisation_id),
  lower(coalesce(relationship.status, relationship.relationship_status, 'pending')) <> 'removed',
  relationship.partner_preferred,
  'relationship_backfill',
  'all_developments',
  '{}'::jsonb,
  jsonb_build_object('backfillSource', 'organisation_partners', 'relationshipSide', 'partner'),
  relationship.created_by,
  relationship.created_at,
  relationship.updated_at
from public.organisation_partners relationship
on conflict (organisation_id, relationship_id, role_type)
  where relationship_id is not null
do update set
  partner_organisation_id = excluded.partner_organisation_id,
  is_active = excluded.is_active,
  updated_at = greatest(public.organisation_partner_roles.updated_at, excluded.updated_at);

create or replace function public.bridge_sync_external_partner_role_configuration()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_relationship_id uuid;
  v_role_type text := public.bridge_normalize_partner_role_type(new.partner_type);
  v_role_id uuid;
begin
  if new.partner_organisation_id is not null then
    select relationship.id into v_relationship_id
    from public.organisation_partners relationship
    where new.organisation_id in (relationship.organisation_id, relationship.partner_organisation_id)
      and new.partner_organisation_id in (relationship.organisation_id, relationship.partner_organisation_id)
    limit 1;
  end if;

  update public.organisation_partner_roles
  set is_active = false, is_preferred_default = false, updated_at = now()
  where organisation_id = new.organisation_id
    and external_partner_id = new.id
    and role_type <> v_role_type
    and is_active;

  if new.is_preferred_default then
    update public.organisation_partner_roles
    set is_preferred_default = false, updated_at = now()
    where organisation_id = new.organisation_id
      and role_type = v_role_type
      and external_partner_id is distinct from new.id
      and is_preferred_default;
  end if;

  select role_config.id into v_role_id
  from public.organisation_partner_roles role_config
  where role_config.organisation_id = new.organisation_id
    and role_config.role_type = v_role_type
    and (
      role_config.external_partner_id = new.id
      or (v_relationship_id is not null and role_config.relationship_id = v_relationship_id)
    )
  order by (role_config.external_partner_id = new.id) desc
  limit 1
  for update;

  if v_role_id is null then
    insert into public.organisation_partner_roles (
      organisation_id, relationship_id, external_partner_id, partner_organisation_id,
      role_type, is_active, is_preferred_default, source, scope_type, scope_json, metadata
    ) values (
      new.organisation_id, v_relationship_id, new.id, new.partner_organisation_id,
      v_role_type, new.is_active, new.is_preferred_default,
      coalesce(nullif(trim(new.source), ''), 'manual'),
      coalesce(nullif(trim(new.scope_type), ''), 'all_developments'),
      coalesce(new.scope_json, '{}'::jsonb),
      jsonb_build_object('synchronizedFrom', 'organisation_preferred_partners')
    );
  else
    update public.organisation_partner_roles
    set relationship_id = v_relationship_id,
        external_partner_id = new.id,
        partner_organisation_id = new.partner_organisation_id,
        is_active = new.is_active,
        is_preferred_default = new.is_preferred_default,
        source = coalesce(nullif(trim(new.source), ''), 'manual'),
        scope_type = coalesce(nullif(trim(new.scope_type), ''), 'all_developments'),
        scope_json = coalesce(new.scope_json, '{}'::jsonb),
        metadata = metadata || jsonb_build_object(
          'synchronizedFrom', 'organisation_preferred_partners'
        ),
        updated_at = now()
    where id = v_role_id;
  end if;

  return new;
end;
$$;

drop trigger if exists external_partner_role_configuration_sync
  on public.organisation_preferred_partners;
create trigger external_partner_role_configuration_sync
after insert or update of partner_type, partner_organisation_id, is_active,
  is_preferred_default, source, scope_type, scope_json
on public.organisation_preferred_partners
for each row execute function public.bridge_sync_external_partner_role_configuration();

create or replace function public.bridge_ensure_relationship_role_configurations(p_relationship_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_relationship public.organisation_partners%rowtype;
begin
  select * into v_relationship
  from public.organisation_partners
  where id = p_relationship_id;
  if v_relationship.id is null then return; end if;

  update public.organisation_partner_roles role_config
  set relationship_id = v_relationship.id,
      partner_organisation_id = v_relationship.partner_organisation_id,
      updated_at = now()
  from public.organisation_preferred_partners external
  where role_config.organisation_id = v_relationship.organisation_id
    and role_config.external_partner_id = external.id
    and external.organisation_id = v_relationship.organisation_id
    and external.partner_organisation_id = v_relationship.partner_organisation_id
    and role_config.relationship_id is distinct from v_relationship.id;

  update public.organisation_partner_roles role_config
  set relationship_id = v_relationship.id,
      partner_organisation_id = v_relationship.organisation_id,
      updated_at = now()
  from public.organisation_preferred_partners external
  where role_config.organisation_id = v_relationship.partner_organisation_id
    and role_config.external_partner_id = external.id
    and external.organisation_id = v_relationship.partner_organisation_id
    and external.partner_organisation_id = v_relationship.organisation_id
    and role_config.relationship_id is distinct from v_relationship.id;

  insert into public.organisation_partner_roles (
    organisation_id, relationship_id, partner_organisation_id, role_type,
    is_active, is_preferred_default, source, metadata, created_by
  ) values (
    v_relationship.organisation_id,
    v_relationship.id,
    v_relationship.partner_organisation_id,
    public.bridge_normalize_partner_role_type(coalesce(
      nullif(trim(v_relationship.partner_type), ''),
      public.bridge_partner_role_for_organisation(v_relationship.partner_organisation_id)
    )),
    lower(coalesce(v_relationship.status, v_relationship.relationship_status, 'pending')) <> 'removed',
    v_relationship.organisation_preferred,
    'relationship_sync',
    jsonb_build_object('relationshipSide', 'organisation'),
    v_relationship.created_by
  )
  on conflict (organisation_id, relationship_id, role_type)
    where relationship_id is not null
  do update set
    partner_organisation_id = excluded.partner_organisation_id,
    is_active = excluded.is_active,
    updated_at = now();

  insert into public.organisation_partner_roles (
    organisation_id, relationship_id, partner_organisation_id, role_type,
    is_active, is_preferred_default, source, metadata, created_by
  ) values (
    v_relationship.partner_organisation_id,
    v_relationship.id,
    v_relationship.organisation_id,
    public.bridge_partner_role_for_organisation(v_relationship.organisation_id),
    lower(coalesce(v_relationship.status, v_relationship.relationship_status, 'pending')) <> 'removed',
    v_relationship.partner_preferred,
    'relationship_sync',
    jsonb_build_object('relationshipSide', 'partner'),
    v_relationship.created_by
  )
  on conflict (organisation_id, relationship_id, role_type)
    where relationship_id is not null
  do update set
    partner_organisation_id = excluded.partner_organisation_id,
    is_active = excluded.is_active,
    updated_at = now();
end;
$$;

create or replace function public.bridge_relationship_role_configuration_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.bridge_ensure_relationship_role_configurations(new.id);
  return new;
end;
$$;

drop trigger if exists relationship_role_configuration_sync on public.organisation_partners;
create trigger relationship_role_configuration_sync
after insert or update of partner_type, relationship_status, status,
  organisation_preferred, partner_preferred
on public.organisation_partners
for each row execute function public.bridge_relationship_role_configuration_trigger();

create or replace function public.bridge_upsert_organisation_partner_role(
  p_organisation_id uuid,
  p_role_id uuid default null,
  p_relationship_id uuid default null,
  p_external_partner_id uuid default null,
  p_role_type text default 'other',
  p_is_active boolean default true,
  p_is_preferred_default boolean default false,
  p_source text default 'manual',
  p_scope_type text default 'all_developments',
  p_scope_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.organisation_partner_roles%rowtype;
  v_role_type text := public.bridge_normalize_partner_role_type(p_role_type);
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if not public.bridge_phase3_can_manage_organization(p_organisation_id) then
    raise exception 'You cannot manage partner roles for this organisation.' using errcode = '42501';
  end if;
  if p_relationship_id is null and p_external_partner_id is null then
    raise exception 'A relationship or external partner is required.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(
    p_organisation_id::text || ':' || coalesce(p_relationship_id::text, p_external_partner_id::text) || ':' || v_role_type
  ));

  if p_role_id is not null then
    select * into v_role from public.organisation_partner_roles
    where id = p_role_id and organisation_id = p_organisation_id for update;
  elsif p_relationship_id is not null then
    select * into v_role from public.organisation_partner_roles
    where organisation_id = p_organisation_id
      and relationship_id = p_relationship_id
      and role_type = v_role_type
    limit 1 for update;
  else
    select * into v_role from public.organisation_partner_roles
    where organisation_id = p_organisation_id
      and external_partner_id = p_external_partner_id
      and role_type = v_role_type
    limit 1 for update;
  end if;

  if p_is_preferred_default then
    update public.organisation_partner_roles
    set is_preferred_default = false, updated_at = now()
    where organisation_id = p_organisation_id
      and role_type = v_role_type
      and id is distinct from v_role.id
      and is_preferred_default;
  end if;

  if v_role.id is null then
    insert into public.organisation_partner_roles (
      organisation_id, relationship_id, external_partner_id, role_type,
      is_active, is_preferred_default, source, scope_type, scope_json, created_by
    ) values (
      p_organisation_id, p_relationship_id, p_external_partner_id, v_role_type,
      coalesce(p_is_active, true), coalesce(p_is_preferred_default, false),
      coalesce(nullif(trim(p_source), ''), 'manual'),
      coalesce(nullif(trim(p_scope_type), ''), 'all_developments'),
      coalesce(p_scope_json, '{}'::jsonb), auth.uid()
    ) returning * into v_role;
  else
    update public.organisation_partner_roles
    set relationship_id = coalesce(p_relationship_id, relationship_id),
        external_partner_id = coalesce(p_external_partner_id, external_partner_id),
        role_type = v_role_type,
        is_active = coalesce(p_is_active, true),
        is_preferred_default = coalesce(p_is_preferred_default, false),
        source = coalesce(nullif(trim(p_source), ''), source),
        scope_type = coalesce(nullif(trim(p_scope_type), ''), scope_type),
        scope_json = coalesce(p_scope_json, scope_json),
        updated_at = now()
    where id = v_role.id returning * into v_role;
  end if;

  return jsonb_build_object('success', true, 'role', to_jsonb(v_role));
end;
$$;

create or replace function public.bridge_list_organisation_partner_roles(p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_roles jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('success', false, 'code', 'not_authenticated'); end if;
  if not public.bridge_is_active_member(p_organisation_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  select coalesce(jsonb_agg(to_jsonb(role_config) order by role_config.role_type, role_config.created_at), '[]'::jsonb)
  into v_roles
  from public.organisation_partner_roles role_config
  where role_config.organisation_id = p_organisation_id;

  return jsonb_build_object(
    'success', true,
    'roles', v_roles,
    'canManage', public.bridge_phase3_can_manage_organization(p_organisation_id)
  );
end;
$$;

alter function public.bridge_list_organisation_partner_directory(uuid)
  rename to bridge_list_organisation_partner_directory_phase1_legacy;

create or replace function public.bridge_list_organisation_partner_directory(p_organisation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_partner jsonb;
  v_roles jsonb;
  v_partners jsonb := '[]'::jsonb;
begin
  v_result := public.bridge_list_organisation_partner_directory_phase1_legacy(p_organisation_id);
  if coalesce((v_result ->> 'success')::boolean, false) is false then return v_result; end if;

  for v_partner in select value from jsonb_array_elements(coalesce(v_result -> 'partners', '[]'::jsonb))
  loop
    select coalesce(jsonb_agg(role_type order by role_type), '[]'::jsonb)
    into v_roles
    from (
      select distinct role_config.role_type
      from public.organisation_partner_roles role_config
      where role_config.organisation_id = p_organisation_id
        and role_config.is_active
        and (
          role_config.relationship_id = nullif(v_partner ->> 'relationshipId', '')::uuid
          or role_config.external_partner_id = nullif(v_partner ->> 'externalPartnerId', '')::uuid
          or (
            role_config.partner_organisation_id is not null
            and role_config.partner_organisation_id = nullif(v_partner ->> 'partnerOrganisationId', '')::uuid
          )
        )
    ) configured_roles;

    v_partners := v_partners || jsonb_build_array(
      jsonb_set(v_partner, '{roles}', coalesce(v_roles, '[]'::jsonb), true)
    );
  end loop;

  return jsonb_set(v_result, '{partners}', v_partners, true)
    || jsonb_build_object('roleConfigurationSource', 'organisation_partner_roles');
end;
$$;

alter table public.transaction_role_players
  add column if not exists partner_role_configuration_id uuid
    references public.organisation_partner_roles(id) on delete set null;
alter table public.private_listing_role_players
  add column if not exists partner_role_configuration_id uuid
    references public.organisation_partner_roles(id) on delete set null;

update public.transaction_role_players role_player
set partner_role_configuration_id = role_config.id
from public.organisation_partner_roles role_config
where role_player.partner_role_configuration_id is null
  and role_config.external_partner_id = role_player.preferred_partner_id
  and role_config.role_type = public.bridge_normalize_partner_role_type(role_player.role_type);

update public.private_listing_role_players role_player
set partner_role_configuration_id = role_config.id
from public.organisation_partner_roles role_config
where role_player.partner_role_configuration_id is null
  and role_config.external_partner_id = role_player.preferred_partner_id
  and role_config.role_type = public.bridge_normalize_partner_role_type(role_player.role_type);

alter table public.organisation_partner_roles enable row level security;
drop policy if exists organisation_partner_roles_select_scoped on public.organisation_partner_roles;
create policy organisation_partner_roles_select_scoped
on public.organisation_partner_roles
for select to authenticated
using (public.bridge_is_active_member(organisation_id));

grant select on public.organisation_partner_roles to authenticated;
revoke insert, update, delete on public.organisation_partner_roles from authenticated;
grant execute on function public.bridge_upsert_organisation_partner_role(
  uuid, uuid, uuid, uuid, text, boolean, boolean, text, text, jsonb
) to authenticated;
grant execute on function public.bridge_list_organisation_partner_roles(uuid) to authenticated;
grant execute on function public.bridge_list_organisation_partner_directory(uuid) to authenticated;

comment on column public.organisation_partners.partner_type is
  'Deprecated compatibility projection. Canonical role configuration lives in organisation_partner_roles.';
comment on column public.organisation_preferred_partners.partner_type is
  'Deprecated compatibility projection. Canonical role configuration lives in organisation_partner_roles.';
comment on column public.organisation_preferred_partners.is_preferred_default is
  'Deprecated compatibility projection. Canonical role defaults live in organisation_partner_roles.';
comment on column public.organisation_preferred_partners.scope_type is
  'Deprecated compatibility projection. Canonical role scope lives in organisation_partner_roles.';
comment on column public.organisation_preferred_partners.scope_json is
  'Deprecated compatibility projection. Canonical role scope lives in organisation_partner_roles.';

notify pgrst, 'reload schema';

commit;
