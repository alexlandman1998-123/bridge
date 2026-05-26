begin;

create extension if not exists "pgcrypto";

create table if not exists public.workspace_regions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  code text,
  description text,
  manager_user_id uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists workspace_regions_workspace_id_idx
  on public.workspace_regions (workspace_id);
create index if not exists workspace_regions_workspace_active_idx
  on public.workspace_regions (workspace_id, active);
create unique index if not exists workspace_regions_workspace_code_unique
  on public.workspace_regions (workspace_id, lower(code))
  where code is not null and length(trim(code)) > 0;

create table if not exists public.workspace_units (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organisations(id) on delete cascade,
  region_id uuid references public.workspace_regions(id) on delete set null,
  parent_unit_id uuid references public.workspace_units(id) on delete set null,
  unit_type text not null,
  name text not null,
  code text,
  description text,
  manager_user_id uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists workspace_units_workspace_id_idx
  on public.workspace_units (workspace_id);
create index if not exists workspace_units_region_id_idx
  on public.workspace_units (region_id)
  where region_id is not null;
create index if not exists workspace_units_parent_unit_id_idx
  on public.workspace_units (parent_unit_id)
  where parent_unit_id is not null;
create unique index if not exists workspace_units_workspace_type_code_unique
  on public.workspace_units (workspace_id, unit_type, lower(code))
  where code is not null and length(trim(code)) > 0;

alter table if exists public.workspace_units
  drop constraint if exists workspace_units_unit_type_check;
alter table if exists public.workspace_units
  add constraint workspace_units_unit_type_check
    check (unit_type in (
      'branch',
      'team',
      'processing_hub',
      'hq_department',
      'admin_team',
      'compliance_team'
    ));

alter table if exists public.organisations
  add column if not exists workspace_kind text;

alter table if exists public.organisations
  drop constraint if exists organisations_workspace_kind_check;
alter table if exists public.organisations
  add constraint organisations_workspace_kind_check
    check (
      workspace_kind is null or
      workspace_kind in (
        'agency',
        'developer_company',
        'attorney_firm',
        'bond_originator',
        'personal_originator',
        'bond_company'
      )
    );

create index if not exists organisations_workspace_kind_idx
  on public.organisations (workspace_kind)
  where workspace_kind is not null;

alter table if exists public.organisation_users
  add column if not exists scope_level text;
alter table if exists public.organisation_users
  add column if not exists region_id uuid references public.workspace_regions(id) on delete set null;
alter table if exists public.organisation_users
  add column if not exists workspace_unit_id uuid references public.workspace_units(id) on delete set null;
alter table if exists public.organisation_users
  add column if not exists scope_metadata jsonb not null default '{}'::jsonb;
alter table if exists public.organisation_users
  add column if not exists active_workspace_selected_at timestamptz;

alter table if exists public.organisation_users
  drop constraint if exists organisation_users_scope_level_check;
alter table if exists public.organisation_users
  add constraint organisation_users_scope_level_check
    check (
      scope_level is null or
      scope_level in ('workspace_hq', 'region', 'branch', 'team', 'assigned')
    );

create index if not exists organisation_users_scope_level_idx
  on public.organisation_users (organisation_id, scope_level);
create index if not exists organisation_users_region_idx
  on public.organisation_users (organisation_id, region_id)
  where region_id is not null;
create index if not exists organisation_users_workspace_unit_idx
  on public.organisation_users (organisation_id, workspace_unit_id)
  where workspace_unit_id is not null;
create index if not exists organisation_users_active_workspace_selected_idx
  on public.organisation_users (organisation_id, active_workspace_selected_at desc)
  where active_workspace_selected_at is not null;

update public.organisations
set workspace_kind = case
  when type = 'bond_originator' then 'bond_company'
  when type in ('agency', 'developer_company', 'attorney_firm') then type
  else coalesce(nullif(trim(workspace_kind), ''), workspace_kind)
end
where workspace_kind is null
   or trim(workspace_kind) = '';

update public.organisation_users
set workspace_role = coalesce(workspace_role, organisation_role, role)
where workspace_role is null
   or trim(workspace_role) = '';

update public.organisation_users
set scope_level = coalesce(
  nullif(trim(scope_level), ''),
  case lower(coalesce(workspace_role, organisation_role, role))
    when 'owner' then 'workspace_hq'
    when 'principal' then 'workspace_hq'
    when 'director' then 'workspace_hq'
    when 'partner' then 'workspace_hq'
    when 'hq_manager' then 'workspace_hq'
    when 'regional_manager' then 'region'
    when 'branch_manager' then 'branch'
    when 'manager' then 'branch'
    when 'admin_staff' then 'branch'
    when 'processor' then 'assigned'
    when 'consultant' then 'assigned'
    when 'compliance' then 'workspace_hq'
    when 'admin' then 'workspace_hq'
    else case lower(coalesce(branch_scope, 'own'))
      when 'all_branches' then 'workspace_hq'
      when 'assigned_branch' then 'branch'
      when 'own' then 'assigned'
      else 'assigned'
    end
  end
)
where scope_level is null
   or trim(scope_level) = '';

create or replace function public.bridge_current_workspace_role(workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim(member.workspace_role), ''),
    nullif(trim(member.organisation_role), ''),
    nullif(trim(member.role), '')
  )
  from public.organisation_users member
  where member.organisation_id = workspace_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  order by member.is_primary_owner desc, member.updated_at desc nulls last, member.created_at desc
  limit 1;
$$;

create or replace function public.bridge_current_scope_level(workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim(lower(member.scope_level)), ''),
    case lower(coalesce(member.branch_scope, 'own'))
      when 'all_branches' then 'workspace_hq'
      when 'assigned_branch' then 'branch'
      else 'assigned'
    end
  )
  from public.organisation_users member
  where member.organisation_id = workspace_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  order by member.is_primary_owner desc, member.updated_at desc nulls last, member.created_at desc
  limit 1;
$$;

create or replace function public.bridge_current_region_id(workspace_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select member.region_id
  from public.organisation_users member
  where member.organisation_id = workspace_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  order by member.is_primary_owner desc, member.updated_at desc nulls last, member.created_at desc
  limit 1;
$$;

create or replace function public.bridge_current_workspace_unit_id(workspace_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select member.workspace_unit_id
  from public.organisation_users member
  where member.organisation_id = workspace_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  order by member.is_primary_owner desc, member.updated_at desc nulls last, member.created_at desc
  limit 1;
$$;

create or replace function public.bridge_is_workspace_hq_member(workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.bridge_current_scope_level(workspace_id) = 'workspace_hq';
$$;

create or replace function public.bridge_can_access_region(workspace_id uuid, target_region_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_scope text;
  v_region_id uuid;
  v_workspace_unit_id uuid;
begin
  if auth.uid() is null or workspace_id is null or target_region_id is null then
    return false;
  end if;

  v_scope := public.bridge_current_scope_level(workspace_id);
  if v_scope = 'workspace_hq' then
    return true;
  end if;

  v_region_id := public.bridge_current_region_id(workspace_id);
  if v_scope = 'region' then
    return v_region_id is not null and v_region_id = target_region_id;
  end if;

  v_workspace_unit_id := public.bridge_current_workspace_unit_id(workspace_id);
  if v_workspace_unit_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.workspace_units unit
    where unit.id = v_workspace_unit_id
      and unit.region_id = target_region_id
      and unit.active = true
  );
end;
$$;

create or replace function public.bridge_can_access_workspace_unit(workspace_id uuid, target_unit_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_scope text;
  v_workspace_unit_id uuid;
begin
  if auth.uid() is null or workspace_id is null or target_unit_id is null then
    return false;
  end if;

  v_scope := public.bridge_current_scope_level(workspace_id);
  if v_scope = 'workspace_hq' then
    return true;
  end if;

  v_workspace_unit_id := public.bridge_current_workspace_unit_id(workspace_id);
  if v_workspace_unit_id is null then
    return false;
  end if;

  if v_scope = 'team' or v_scope = 'branch' then
    return v_workspace_unit_id = target_unit_id;
  end if;

  return false;
end;
$$;

create or replace function public.bridge_can_access_assigned_bond_application(transaction_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_assigned_user_id uuid;
  v_owner_user_id uuid;
  v_assigned_bond_originator_email text;
  v_bond_originator_name text;
  v_current_email text;
begin
  if transaction_id is null or auth.uid() is null then
    return false;
  end if;

  select t.assigned_user_id, t.owner_user_id, lower(coalesce(t.assigned_bond_originator_email, '')), lower(coalesce(t.bond_originator, ''))
  into v_assigned_user_id, v_owner_user_id, v_assigned_bond_originator_email, v_bond_originator_name
  from public.transactions t
  where t.id = transaction_id
  limit 1;

  if v_assigned_user_id is null and v_owner_user_id is null and v_assigned_bond_originator_email = '' and v_bond_originator_name = '' then
    return false;
  end if;

  if v_assigned_user_id = auth.uid() then
    return true;
  end if;
  if v_owner_user_id = auth.uid() then
    return true;
  end if;

  v_current_email := public.bridge_current_email();
  if v_current_email is not null and (
    v_current_email = v_assigned_bond_originator_email
    or v_current_email = v_bond_originator_name
  ) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.bridge_can_access_bond_application(transaction_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_transaction record;
  v_workspace_id uuid;
  v_scope text;
  v_region_id uuid;
  v_workspace_unit_id uuid;
begin
  if transaction_id is null or auth.uid() is null then
    return false;
  end if;

  select * into v_transaction
  from public.transactions t
  where t.id = transaction_id
  limit 1;

  if v_transaction is null then
    return false;
  end if;

  v_workspace_id := v_transaction.organisation_id;
  if v_workspace_id is null then
    return false;
  end if;

  v_scope := public.bridge_current_scope_level(v_workspace_id);
  if v_scope = 'workspace_hq' then
    return true;
  end if;

  if public.bridge_can_access_assigned_bond_application(transaction_id) then
    return true;
  end if;

  if v_scope = 'region' then
    v_region_id := public.bridge_current_region_id(v_workspace_id);
    return public.bridge_can_access_region(v_workspace_id, v_region_id);
  end if;

  if v_scope = 'team' or v_scope = 'branch' then
    v_workspace_unit_id := public.bridge_current_workspace_unit_id(v_workspace_id);
    return public.bridge_can_access_workspace_unit(v_workspace_id, coalesce(v_transaction.assigned_branch_id, v_workspace_unit_id));
  end if;

  return public.bridge_can_access_workspace_record(
    v_workspace_id,
    v_transaction.assigned_branch_id,
    v_transaction.assigned_user_id,
    null
  );
end;
$$;

grant execute on function public.bridge_current_workspace_role(uuid) to authenticated;
grant execute on function public.bridge_current_scope_level(uuid) to authenticated;
grant execute on function public.bridge_current_region_id(uuid) to authenticated;
grant execute on function public.bridge_current_workspace_unit_id(uuid) to authenticated;
grant execute on function public.bridge_is_workspace_hq_member(uuid) to authenticated;
grant execute on function public.bridge_can_access_region(uuid, uuid) to authenticated;
grant execute on function public.bridge_can_access_workspace_unit(uuid, uuid) to authenticated;
grant execute on function public.bridge_can_access_assigned_bond_application(uuid) to authenticated;
grant execute on function public.bridge_can_access_bond_application(uuid) to authenticated;

commit;
