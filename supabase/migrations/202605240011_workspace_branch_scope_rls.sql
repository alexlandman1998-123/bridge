begin;

alter table if exists public.organisation_users
  add column if not exists workspace_role text,
  add column if not exists primary_branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists branch_scope text not null default 'own';

do $$
begin
  alter table public.organisation_users
    drop constraint if exists organisation_users_branch_scope_check;
  alter table public.organisation_users
    add constraint organisation_users_branch_scope_check
    check (branch_scope in ('own', 'assigned_branch', 'all_branches'));
exception
  when undefined_table then null;
end $$;

create index if not exists organisation_users_primary_branch_idx
  on public.organisation_users (primary_branch_id);

create index if not exists organisation_users_branch_scope_idx
  on public.organisation_users (organisation_id, branch_scope);

update public.organisation_users
set
  workspace_role = coalesce(workspace_role, organisation_role, role),
  primary_branch_id = coalesce(primary_branch_id, branch_id),
  branch_scope = case
    when coalesce(workspace_role, organisation_role, role) in ('owner', 'principal', 'director', 'partner') then 'all_branches'
    when coalesce(workspace_role, organisation_role, role) in ('branch_manager', 'manager', 'admin_staff', 'processor', 'paralegal') then 'assigned_branch'
    else coalesce(nullif(branch_scope, ''), 'own')
  end
where workspace_role is null
  or primary_branch_id is null
  or branch_scope is null
  or branch_scope not in ('own', 'assigned_branch', 'all_branches');

insert into public.organisation_branches (
  organisation_id,
  name,
  slug,
  is_head_office,
  is_default,
  is_active,
  status,
  metadata_json,
  created_by
)
select
  org.id,
  case
    when org.type = 'bond_originator' then 'Main Team'
    else 'Head Office'
  end,
  case
    when org.type = 'bond_originator' then 'main-team'
    else 'head-office'
  end,
  true,
  true,
  true,
  'active',
  jsonb_build_object(
    'defaultStructure', true,
    'source', 'workspace_branch_scope_rls',
    'workspaceType', org.type
  ),
  org.created_by
from public.organisations org
where org.type in ('agency', 'attorney_firm', 'bond_originator')
  and not exists (
    select 1
    from public.organisation_branches branch
    where branch.organisation_id = org.id
  );

with default_branches as (
  select distinct on (organisation_id)
    organisation_id,
    id
  from public.organisation_branches
  where is_active = true
  order by organisation_id, is_default desc, is_head_office desc, created_at asc
)
update public.organisation_users member
set
  branch_id = coalesce(member.branch_id, default_branches.id),
  primary_branch_id = coalesce(member.primary_branch_id, member.branch_id, default_branches.id),
  branch_scope = case
    when coalesce(member.workspace_role, member.organisation_role, member.role) in ('owner', 'principal', 'director', 'partner') then 'all_branches'
    when coalesce(member.workspace_role, member.organisation_role, member.role) in ('branch_manager', 'manager', 'admin_staff', 'processor', 'paralegal') then 'assigned_branch'
    else coalesce(nullif(member.branch_scope, ''), 'own')
  end
from default_branches
where member.organisation_id = default_branches.organisation_id
  and (member.branch_id is null or member.primary_branch_id is null or member.branch_scope is null);

create or replace function public.bridge_current_workspace_role(workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(member.workspace_role, member.organisation_role, member.role)
  from public.organisation_users member
  where member.organisation_id = workspace_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  order by member.is_primary_owner desc, member.updated_at desc nulls last, member.created_at desc
  limit 1;
$$;

create or replace function public.bridge_current_branch_scope(workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    member.branch_scope,
    case
      when coalesce(member.workspace_role, member.organisation_role, member.role) in ('owner', 'principal', 'director', 'partner') then 'all_branches'
      when coalesce(member.workspace_role, member.organisation_role, member.role) in ('branch_manager', 'manager', 'admin_staff', 'processor', 'paralegal') then 'assigned_branch'
      else 'own'
    end
  )
  from public.organisation_users member
  where member.organisation_id = workspace_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  order by member.is_primary_owner desc, member.updated_at desc nulls last, member.created_at desc
  limit 1;
$$;

create or replace function public.bridge_current_branch_id(workspace_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(member.primary_branch_id, member.branch_id)
  from public.organisation_users member
  where member.organisation_id = workspace_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  order by member.is_primary_owner desc, member.updated_at desc nulls last, member.created_at desc
  limit 1;
$$;

create or replace function public.bridge_can_access_workspace_record(
  workspace_id uuid,
  record_branch_id uuid default null,
  assigned_user_id uuid default null,
  permission_key text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_scope text;
  v_branch_id uuid;
begin
  if auth.uid() is null or workspace_id is null then
    return false;
  end if;

  select
    public.bridge_current_branch_scope(workspace_id),
    public.bridge_current_branch_id(workspace_id)
  into v_scope, v_branch_id;

  if v_scope is null then
    return false;
  end if;

  if v_scope = 'all_branches' then
    return true;
  end if;

  if v_scope = 'assigned_branch' then
    return (record_branch_id is not null and v_branch_id is not null and record_branch_id = v_branch_id)
      or (assigned_user_id is not null and assigned_user_id = auth.uid());
  end if;

  return assigned_user_id is not null and assigned_user_id = auth.uid();
end;
$$;

grant execute on function public.bridge_current_workspace_role(uuid) to authenticated;
grant execute on function public.bridge_current_branch_scope(uuid) to authenticated;
grant execute on function public.bridge_current_branch_id(uuid) to authenticated;
grant execute on function public.bridge_can_access_workspace_record(uuid, uuid, uuid, text) to authenticated;

commit;
