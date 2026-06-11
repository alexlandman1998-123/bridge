create extension if not exists "pgcrypto";

alter table if exists public.organisation_branches
  add column if not exists region_id uuid references public.workspace_regions(id) on delete set null,
  add column if not exists code text,
  add column if not exists status text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

update public.organisation_branches
set code = coalesce(nullif(trim(code), ''), nullif(trim(slug), '')),
    status = coalesce(nullif(trim(status), ''), case when is_active then 'active' else 'inactive' end)
where code is null or status is null;

alter table if exists public.organisation_branches
  drop constraint if exists organisation_branches_status_check;
alter table if exists public.organisation_branches
  add constraint organisation_branches_status_check
  check (status is null or status in ('active', 'inactive'));

create index if not exists organisation_branches_region_idx
  on public.organisation_branches (organisation_id, region_id)
  where region_id is not null;
create unique index if not exists organisation_branches_org_code_unique
  on public.organisation_branches (organisation_id, lower(code))
  where code is not null and length(trim(code)) > 0;

alter table if exists public.transactions
  add column if not exists assigned_region_id uuid references public.workspace_regions(id) on delete set null;
create index if not exists transactions_assigned_region_id_idx
  on public.transactions (assigned_region_id)
  where assigned_region_id is not null;

create table if not exists public.branch_members (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.organisation_branches(id) on delete cascade,
  organisation_user_id uuid references public.organisation_users(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'consultant',
  status text not null default 'active',
  joined_at timestamptz,
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_members_role_check check (role in ('branch_manager', 'consultant', 'attorney', 'agent', 'admin', 'manager', 'assistant', 'principal')),
  constraint branch_members_status_check check (status in ('active', 'inactive', 'removed', 'pending'))
);

alter table if exists public.branch_members
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists branch_id uuid references public.organisation_branches(id) on delete cascade,
  add column if not exists organisation_user_id uuid references public.organisation_users(id) on delete set null,
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists role text default 'consultant',
  add column if not exists status text default 'active',
  add column if not exists joined_at timestamptz,
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists invited_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists branch_members_branch_user_uidx
  on public.branch_members (branch_id, user_id);
create index if not exists branch_members_user_idx
  on public.branch_members (user_id, status);
create index if not exists branch_members_org_user_idx
  on public.branch_members (organisation_user_id)
  where organisation_user_id is not null;

create or replace function public.bridge_phase5_touch_branch_member()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status = 'active' and new.joined_at is null then
    new.joined_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists branch_members_phase5_touch on public.branch_members;
create trigger branch_members_phase5_touch
before insert or update on public.branch_members
for each row execute function public.bridge_phase5_touch_branch_member();

create or replace view public.organization_regions
with (security_invoker = true)
as
select
  wr.id,
  wr.workspace_id as organization_id,
  wr.name,
  wr.code,
  case when wr.active then 'active' else 'inactive' end as status,
  wr.manager_user_id,
  wr.created_at,
  wr.updated_at
from public.workspace_regions wr;

create or replace view public.organization_branches
with (security_invoker = true)
as
select
  ob.id,
  ob.organisation_id as organization_id,
  ob.region_id,
  ob.name,
  coalesce(ob.code, ob.slug) as code,
  ob.email,
  ob.phone,
  coalesce(ob.status, case when ob.is_active then 'active' else 'inactive' end) as status,
  ob.principal_user_id as manager_user_id,
  ob.created_at,
  ob.updated_at
from public.organisation_branches ob;

create or replace function public.bridge_phase5_role_rank(p_role text, p_scope text)
returns integer
language sql
immutable
as $$
  select case
    when lower(coalesce(p_scope, '')) in ('workspace_hq', 'organisation', 'organization') then 90
    when lower(coalesce(p_role, '')) in ('owner', 'principal', 'super_admin', 'director', 'partner', 'admin', 'hq_manager', 'bond_hq_admin', 'bond_hq_manager') then 90
    when lower(coalesce(p_scope, '')) = 'region' then 60
    when lower(coalesce(p_role, '')) in ('regional_manager', 'bond_regional_manager') then 60
    when lower(coalesce(p_scope, '')) = 'branch' then 40
    when lower(coalesce(p_role, '')) in ('branch_manager', 'branch_admin', 'manager', 'bond_branch_manager') then 40
    else 10
  end
$$;

create or replace function public.bridge_phase5_membership_scope(p_organization_id uuid)
returns table(
  membership_id uuid,
  user_id uuid,
  role text,
  scope_level text,
  region_id uuid,
  branch_id uuid,
  can_manage_hierarchy boolean,
  can_manage_region boolean,
  can_manage_branch boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ou.id,
    ou.user_id,
    coalesce(nullif(ou.workspace_role, ''), nullif(ou.organization_role, ''), nullif(ou.organisation_role, ''), nullif(ou.role, ''), 'member') as role,
    coalesce(nullif(ou.scope_level, ''), case
      when coalesce(ou.organization_role, ou.organisation_role, ou.role) in ('owner', 'principal', 'admin', 'super_admin', 'director', 'partner') then 'workspace_hq'
      when coalesce(ou.primary_branch_id, ou.branch_id) is not null then 'branch'
      else 'assigned'
    end) as scope_level,
    ou.region_id,
    coalesce(ou.primary_branch_id, ou.branch_id) as branch_id,
    public.bridge_phase5_role_rank(coalesce(ou.workspace_role, ou.organization_role, ou.organisation_role, ou.role), ou.scope_level) >= 90 as can_manage_hierarchy,
    public.bridge_phase5_role_rank(coalesce(ou.workspace_role, ou.organization_role, ou.organisation_role, ou.role), ou.scope_level) >= 60 as can_manage_region,
    public.bridge_phase5_role_rank(coalesce(ou.workspace_role, ou.organization_role, ou.organisation_role, ou.role), ou.scope_level) >= 40 as can_manage_branch
  from public.organisation_users ou
  where ou.organisation_id = p_organization_id
    and ou.user_id = auth.uid()
    and coalesce(ou.membership_status, ou.status) = 'active'
  order by public.bridge_phase5_role_rank(coalesce(ou.workspace_role, ou.organization_role, ou.organisation_role, ou.role), ou.scope_level) desc,
           ou.updated_at desc nulls last,
           ou.created_at desc
  limit 1
$$;

create or replace function public.bridge_phase5_can_manage_hierarchy(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select can_manage_hierarchy from public.bridge_phase5_membership_scope(p_organization_id) limit 1), false)
$$;

create or replace function public.bridge_phase5_can_manage_region(p_organization_id uuid, p_region_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_scope record;
begin
  select * into v_scope from public.bridge_phase5_membership_scope(p_organization_id) limit 1;
  if not found then
    return false;
  end if;
  if v_scope.can_manage_hierarchy then
    return true;
  end if;
  return v_scope.can_manage_region and v_scope.region_id is not null and v_scope.region_id = p_region_id;
end;
$$;

create or replace function public.bridge_phase5_can_manage_branch(p_organization_id uuid, p_branch_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_scope record;
  v_branch public.organisation_branches%rowtype;
begin
  select * into v_scope from public.bridge_phase5_membership_scope(p_organization_id) limit 1;
  if not found then
    return false;
  end if;
  if v_scope.can_manage_hierarchy then
    return true;
  end if;

  select * into v_branch
  from public.organisation_branches
  where id = p_branch_id
    and organisation_id = p_organization_id;

  if v_branch.id is null then
    return false;
  end if;

  if v_scope.can_manage_region and v_scope.region_id is not null and v_scope.region_id = v_branch.region_id then
    return true;
  end if;

  return v_scope.can_manage_branch and v_scope.branch_id is not null and v_scope.branch_id = p_branch_id;
end;
$$;

create or replace function public.bridge_phase5_list_hierarchy(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope record;
  v_regions jsonb := '[]'::jsonb;
  v_branches jsonb := '[]'::jsonb;
  v_members jsonb := '[]'::jsonb;
begin
  select * into v_scope from public.bridge_phase5_membership_scope(p_organization_id) limit 1;
  if not found then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.name), '[]'::jsonb)
  into v_regions
  from (
    select
      wr.id,
      wr.workspace_id as organization_id,
      wr.name,
      wr.code,
      case when wr.active then 'active' else 'inactive' end as status,
      wr.manager_user_id,
      count(distinct ob.id)::integer as branch_count,
      count(distinct bm.user_id)::integer as user_count,
      count(distinct tx.id)::integer as transaction_count,
      wr.created_at,
      wr.updated_at
    from public.workspace_regions wr
    left join public.organisation_branches ob on ob.region_id = wr.id and coalesce(ob.status, case when ob.is_active then 'active' else 'inactive' end) = 'active'
    left join public.branch_members bm on bm.branch_id = ob.id and bm.status = 'active'
    left join public.transactions tx on tx.assigned_region_id = wr.id or tx.assigned_branch_id = ob.id
    where wr.workspace_id = p_organization_id
      and wr.active = true
      and (
        v_scope.can_manage_hierarchy
        or (v_scope.can_manage_region and v_scope.region_id = wr.id)
        or exists (
          select 1
          from public.organisation_branches scoped_branch
          where scoped_branch.region_id = wr.id
            and scoped_branch.id = v_scope.branch_id
        )
      )
    group by wr.id
  ) row_data;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.name), '[]'::jsonb)
  into v_branches
  from (
    select
      ob.id,
      ob.organisation_id as organization_id,
      ob.region_id,
      region.name as region_name,
      ob.name,
      coalesce(ob.code, ob.slug) as code,
      ob.email,
      ob.phone,
      coalesce(ob.status, case when ob.is_active then 'active' else 'inactive' end) as status,
      ob.principal_user_id as manager_user_id,
      count(distinct bm.user_id)::integer as user_count,
      count(distinct tx.id)::integer as transaction_count,
      count(distinct tx.id) filter (
        where lower(coalesce(tx.stage, tx.current_main_stage, tx.status, '')) not in ('registered', 'completed', 'complete', 'cancelled', 'archived')
      )::integer as active_transaction_count,
      (
        coalesce(ob.metadata_json ->> 'source', '') = 'migration_default'
        and count(distinct bm.user_id) = 0
        and count(distinct tx.id) = 0
      ) as is_empty_default,
      ob.created_at,
      ob.updated_at
    from public.organisation_branches ob
    left join public.workspace_regions region on region.id = ob.region_id
    left join public.branch_members bm on bm.branch_id = ob.id and bm.status = 'active'
    left join public.transactions tx on tx.assigned_branch_id = ob.id
    where ob.organisation_id = p_organization_id
      and coalesce(ob.status, case when ob.is_active then 'active' else 'inactive' end) = 'active'
      and (
        v_scope.can_manage_hierarchy
        or (v_scope.can_manage_region and v_scope.region_id is not null and ob.region_id = v_scope.region_id)
        or (v_scope.can_manage_branch and v_scope.branch_id = ob.id)
        or exists (
          select 1
          from public.branch_members own_branch
          where own_branch.branch_id = ob.id
            and own_branch.user_id = auth.uid()
            and own_branch.status = 'active'
        )
      )
    group by ob.id, region.name
  ) row_data
  where not row_data.is_empty_default;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.full_name), '[]'::jsonb)
  into v_members
  from (
    select
      ou.id as membership_id,
      ou.user_id,
      coalesce(p.full_name, trim(concat(coalesce(ou.first_name, ''), ' ', coalesce(ou.last_name, ''))), ou.email) as full_name,
      ou.email,
      coalesce(nullif(ou.workspace_role, ''), nullif(ou.organization_role, ''), nullif(ou.organisation_role, ''), nullif(ou.role, ''), 'member') as workspace_role,
      coalesce(nullif(ou.scope_level, ''), 'assigned') as scope_level,
      ou.region_id,
      coalesce(ou.primary_branch_id, ou.branch_id) as branch_id,
      wr.name as region_name,
      ob.name as branch_name,
      coalesce(ou.membership_status, ou.status) as membership_status
    from public.organisation_users ou
    left join public.profiles p on p.id = ou.user_id
    left join public.workspace_regions wr on wr.id = ou.region_id
    left join public.organisation_branches ob on ob.id = coalesce(ou.primary_branch_id, ou.branch_id)
    where ou.organisation_id = p_organization_id
      and coalesce(ou.membership_status, ou.status) = 'active'
      and (
        v_scope.can_manage_hierarchy
        or (v_scope.can_manage_region and v_scope.region_id is not null and (ou.region_id = v_scope.region_id or ob.region_id = v_scope.region_id))
        or (v_scope.can_manage_branch and v_scope.branch_id is not null and coalesce(ou.primary_branch_id, ou.branch_id) = v_scope.branch_id)
        or ou.user_id = auth.uid()
      )
  ) row_data;

  return jsonb_build_object(
    'success', true,
    'scope', to_jsonb(v_scope),
    'regions', v_regions,
    'branches', v_branches,
    'members', v_members,
    'canManageHierarchy', coalesce(v_scope.can_manage_hierarchy, false),
    'canManageRegion', coalesce(v_scope.can_manage_region, false),
    'canManageBranch', coalesce(v_scope.can_manage_branch, false)
  );
end;
$$;

create or replace function public.bridge_phase5_create_region(
  p_organization_id uuid,
  p_region jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := nullif(trim(coalesce(p_region->>'name', '')), '');
  v_code text := nullif(upper(trim(coalesce(p_region->>'code', ''))), '');
  v_manager_user_id uuid := nullif(p_region->>'managerUserId', '')::uuid;
  v_region public.workspace_regions%rowtype;
begin
  if not public.bridge_phase5_can_manage_hierarchy(p_organization_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;
  if v_name is null then
    return jsonb_build_object('success', false, 'code', 'region_name_required');
  end if;

  insert into public.workspace_regions (
    workspace_id,
    name,
    code,
    manager_user_id,
    active,
    created_by,
    updated_by
  )
  values (
    p_organization_id,
    v_name,
    v_code,
    v_manager_user_id,
    true,
    v_actor,
    v_actor
  )
  returning * into v_region;

  if v_manager_user_id is not null then
    update public.organisation_users
    set workspace_role = 'regional_manager',
        scope_level = 'region',
        region_id = v_region.id,
        updated_at = now()
    where organisation_id = p_organization_id
      and user_id = v_manager_user_id;
  end if;

  perform public.bridge_phase3_log_organization_event(
    p_organization_id,
    'Region Created',
    v_actor,
    v_manager_user_id,
    null,
    null,
    jsonb_build_object('regionId', v_region.id, 'name', v_region.name)
  );

  return jsonb_build_object('success', true, 'region', to_jsonb(v_region));
end;
$$;

create or replace function public.bridge_phase5_update_region(
  p_organization_id uuid,
  p_region_id uuid,
  p_region jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_manager_user_id uuid := nullif(p_region->>'managerUserId', '')::uuid;
  v_region public.workspace_regions%rowtype;
begin
  if not public.bridge_phase5_can_manage_hierarchy(p_organization_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  update public.workspace_regions
  set name = coalesce(nullif(trim(p_region->>'name'), ''), name),
      code = coalesce(nullif(upper(trim(p_region->>'code')), ''), code),
      manager_user_id = coalesce(v_manager_user_id, manager_user_id),
      active = coalesce((p_region->>'active')::boolean, active),
      updated_by = v_actor,
      updated_at = now()
  where id = p_region_id
    and workspace_id = p_organization_id
  returning * into v_region;

  if v_region.id is null then
    return jsonb_build_object('success', false, 'code', 'region_not_found');
  end if;

  if v_manager_user_id is not null then
    update public.organisation_users
    set workspace_role = 'regional_manager',
        scope_level = 'region',
        region_id = v_region.id,
        updated_at = now()
    where organisation_id = p_organization_id
      and user_id = v_manager_user_id;
  end if;

  perform public.bridge_phase3_log_organization_event(
    p_organization_id,
    'Region Updated',
    v_actor,
    v_manager_user_id,
    null,
    null,
    jsonb_build_object('regionId', v_region.id, 'name', v_region.name)
  );

  return jsonb_build_object('success', true, 'region', to_jsonb(v_region));
end;
$$;

create or replace function public.bridge_phase5_create_branch(
  p_organization_id uuid,
  p_branch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_name text := nullif(trim(coalesce(p_branch->>'name', '')), '');
  v_code text := nullif(upper(trim(coalesce(p_branch->>'code', ''))), '');
  v_region_id uuid := nullif(p_branch->>'regionId', '')::uuid;
  v_manager_user_id uuid := nullif(p_branch->>'managerUserId', '')::uuid;
  v_branch public.organisation_branches%rowtype;
begin
  if not public.bridge_phase5_can_manage_hierarchy(p_organization_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;
  if v_name is null then
    return jsonb_build_object('success', false, 'code', 'branch_name_required');
  end if;
  if v_region_id is not null and not exists (select 1 from public.workspace_regions where id = v_region_id and workspace_id = p_organization_id) then
    return jsonb_build_object('success', false, 'code', 'region_not_found');
  end if;

  insert into public.organisation_branches (
    organisation_id,
    region_id,
    name,
    slug,
    code,
    email,
    phone,
    principal_user_id,
    is_active,
    status,
    metadata_json,
    created_by,
    updated_by
  )
  values (
    p_organization_id,
    v_region_id,
    v_name,
    lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g')),
    v_code,
    nullif(trim(coalesce(p_branch->>'email', '')), ''),
    nullif(trim(coalesce(p_branch->>'phone', '')), ''),
    v_manager_user_id,
    true,
    'active',
    jsonb_build_object('source', 'phase5_enterprise_hierarchy'),
    v_actor,
    v_actor
  )
  returning * into v_branch;

  if v_manager_user_id is not null then
    perform public.bridge_phase5_assign_branch_member(
      p_organization_id,
      v_branch.id,
      v_manager_user_id,
      'branch_manager'
    );
  end if;

  perform public.bridge_phase3_log_organization_event(
    p_organization_id,
    'Branch Created',
    v_actor,
    v_manager_user_id,
    null,
    null,
    jsonb_build_object('branchId', v_branch.id, 'name', v_branch.name, 'regionId', v_region_id)
  );

  return jsonb_build_object('success', true, 'branch', to_jsonb(v_branch));
end;
$$;

create or replace function public.bridge_phase5_update_branch(
  p_organization_id uuid,
  p_branch_id uuid,
  p_branch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_region_id uuid := nullif(p_branch->>'regionId', '')::uuid;
  v_manager_user_id uuid := nullif(p_branch->>'managerUserId', '')::uuid;
  v_branch public.organisation_branches%rowtype;
begin
  if not public.bridge_phase5_can_manage_branch(p_organization_id, p_branch_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;
  if v_region_id is not null and not exists (select 1 from public.workspace_regions where id = v_region_id and workspace_id = p_organization_id) then
    return jsonb_build_object('success', false, 'code', 'region_not_found');
  end if;

  update public.organisation_branches
  set name = coalesce(nullif(trim(p_branch->>'name'), ''), name),
      code = coalesce(nullif(upper(trim(p_branch->>'code')), ''), code),
      slug = coalesce(nullif(lower(regexp_replace(p_branch->>'name', '[^a-zA-Z0-9]+', '-', 'g')), ''), slug),
      region_id = case when p_branch ? 'regionId' then v_region_id else region_id end,
      email = case when p_branch ? 'email' then nullif(trim(coalesce(p_branch->>'email', '')), '') else email end,
      phone = case when p_branch ? 'phone' then nullif(trim(coalesce(p_branch->>'phone', '')), '') else phone end,
      principal_user_id = coalesce(v_manager_user_id, principal_user_id),
      is_active = coalesce((p_branch->>'active')::boolean, is_active),
      status = case when p_branch ? 'active' then case when (p_branch->>'active')::boolean then 'active' else 'inactive' end else status end,
      updated_by = v_actor,
      updated_at = now()
  where id = p_branch_id
    and organisation_id = p_organization_id
  returning * into v_branch;

  if v_branch.id is null then
    return jsonb_build_object('success', false, 'code', 'branch_not_found');
  end if;

  if v_manager_user_id is not null then
    perform public.bridge_phase5_assign_branch_member(
      p_organization_id,
      v_branch.id,
      v_manager_user_id,
      'branch_manager'
    );
  end if;

  perform public.bridge_phase3_log_organization_event(
    p_organization_id,
    'Branch Updated',
    v_actor,
    v_manager_user_id,
    null,
    null,
    jsonb_build_object('branchId', v_branch.id, 'name', v_branch.name, 'regionId', v_branch.region_id)
  );

  return jsonb_build_object('success', true, 'branch', to_jsonb(v_branch));
end;
$$;

create or replace function public.bridge_phase5_assign_branch_member(
  p_organization_id uuid,
  p_branch_id uuid,
  p_user_id uuid,
  p_branch_role text default 'consultant'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := lower(trim(coalesce(p_branch_role, 'consultant')));
  v_branch public.organisation_branches%rowtype;
  v_membership public.organisation_users%rowtype;
  v_branch_member public.branch_members%rowtype;
begin
  if not public.bridge_phase5_can_manage_branch(p_organization_id, p_branch_id) then
    return jsonb_build_object('success', false, 'code', 'not_authorized');
  end if;

  if v_role not in ('branch_manager', 'consultant', 'attorney', 'agent', 'admin') then
    v_role := 'consultant';
  end if;

  select *
  into v_branch
  from public.organisation_branches
  where id = p_branch_id
    and organisation_id = p_organization_id;

  if v_branch.id is null then
    return jsonb_build_object('success', false, 'code', 'branch_not_found');
  end if;

  select *
  into v_membership
  from public.organisation_users
  where organisation_id = p_organization_id
    and user_id = p_user_id
    and coalesce(membership_status, status) = 'active'
  order by created_at asc
  limit 1;

  if v_membership.id is null then
    return jsonb_build_object('success', false, 'code', 'membership_not_found');
  end if;

  insert into public.branch_members (
    branch_id,
    organisation_user_id,
    user_id,
    role,
    status,
    invited_by,
    invited_at,
    accepted_at,
    joined_at
  )
  values (
    p_branch_id,
    v_membership.id,
    p_user_id,
    v_role,
    'active',
    v_actor,
    now(),
    now(),
    now()
  )
  on conflict (branch_id, user_id) do update
  set organisation_user_id = excluded.organisation_user_id,
      role = excluded.role,
      status = 'active',
      updated_at = now()
  returning * into v_branch_member;

  update public.organisation_users
  set branch_id = p_branch_id,
      primary_branch_id = p_branch_id,
      region_id = v_branch.region_id,
      workspace_role = case when v_role = 'branch_manager' then 'branch_manager' else coalesce(workspace_role, v_role) end,
      scope_level = case when v_role = 'branch_manager' then 'branch' else coalesce(scope_level, 'assigned') end,
      updated_at = now()
  where id = v_membership.id
  returning * into v_membership;

  if v_role = 'branch_manager' then
    update public.organisation_branches
    set principal_user_id = p_user_id,
        updated_by = v_actor,
        updated_at = now()
    where id = p_branch_id;
  end if;

  perform public.bridge_phase3_log_organization_event(
    p_organization_id,
    case when v_role = 'branch_manager' then 'Manager Assigned' else 'User Assigned To Branch' end,
    v_actor,
    p_user_id,
    null,
    null,
    jsonb_build_object('branchId', p_branch_id, 'branchRole', v_role, 'branchMemberId', v_branch_member.id)
  );

  return jsonb_build_object('success', true, 'branchMember', to_jsonb(v_branch_member), 'membership', to_jsonb(v_membership));
end;
$$;

alter table public.branch_members enable row level security;

drop policy if exists branch_members_select_scoped on public.branch_members;
create policy branch_members_select_scoped
on public.branch_members
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_branches ob
    where ob.id = branch_members.branch_id
      and (
        public.bridge_phase5_can_manage_branch(ob.organisation_id, ob.id)
        or branch_members.user_id = auth.uid()
      )
  )
);

drop policy if exists branch_members_insert_scoped on public.branch_members;
create policy branch_members_insert_scoped
on public.branch_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organisation_branches ob
    where ob.id = branch_members.branch_id
      and public.bridge_phase5_can_manage_branch(ob.organisation_id, ob.id)
  )
);

drop policy if exists branch_members_update_scoped on public.branch_members;
create policy branch_members_update_scoped
on public.branch_members
for update
to authenticated
using (
  exists (
    select 1
    from public.organisation_branches ob
    where ob.id = branch_members.branch_id
      and public.bridge_phase5_can_manage_branch(ob.organisation_id, ob.id)
  )
)
with check (
  exists (
    select 1
    from public.organisation_branches ob
    where ob.id = branch_members.branch_id
      and public.bridge_phase5_can_manage_branch(ob.organisation_id, ob.id)
  )
);

grant select on public.organization_regions to authenticated;
grant select on public.organization_branches to authenticated;
grant select, insert, update on public.branch_members to authenticated;
grant execute on function public.bridge_phase5_membership_scope(uuid) to authenticated;
grant execute on function public.bridge_phase5_can_manage_hierarchy(uuid) to authenticated;
grant execute on function public.bridge_phase5_can_manage_region(uuid, uuid) to authenticated;
grant execute on function public.bridge_phase5_can_manage_branch(uuid, uuid) to authenticated;
grant execute on function public.bridge_phase5_list_hierarchy(uuid) to authenticated;
grant execute on function public.bridge_phase5_create_region(uuid, jsonb) to authenticated;
grant execute on function public.bridge_phase5_update_region(uuid, uuid, jsonb) to authenticated;
grant execute on function public.bridge_phase5_create_branch(uuid, jsonb) to authenticated;
grant execute on function public.bridge_phase5_update_branch(uuid, uuid, jsonb) to authenticated;
grant execute on function public.bridge_phase5_assign_branch_member(uuid, uuid, uuid, text) to authenticated;
