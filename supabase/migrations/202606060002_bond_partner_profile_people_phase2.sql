begin;

create table if not exists public.partner_visibility_permissions (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.organisation_partners(id) on delete cascade,
  permission_key text not null,
  is_enabled boolean not null default false,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_visibility_permissions_key_check check (
    permission_key in (
      'can_view_principal',
      'can_view_branch_managers',
      'can_view_agents'
    )
  ),
  constraint partner_visibility_permissions_unique_key unique (relationship_id, permission_key)
);

create index if not exists partner_visibility_permissions_relationship_idx
  on public.partner_visibility_permissions (relationship_id, permission_key, is_enabled);

drop trigger if exists trg_partner_visibility_permissions_updated_at on public.partner_visibility_permissions;
create trigger trg_partner_visibility_permissions_updated_at
before update on public.partner_visibility_permissions
for each row
execute function public.set_updated_at_timestamp();

alter table public.partner_visibility_permissions enable row level security;

drop policy if exists partner_visibility_permissions_select_related_orgs on public.partner_visibility_permissions;
create policy partner_visibility_permissions_select_related_orgs
on public.partner_visibility_permissions
for select to authenticated
using (
  exists (
    select 1
    from public.organisation_partners op
    where op.id = partner_visibility_permissions.relationship_id
      and (
        public.bridge_is_active_member(op.organisation_id)
        or public.bridge_is_active_member(op.partner_organisation_id)
      )
  )
);

drop policy if exists partner_visibility_permissions_manage_related_admin on public.partner_visibility_permissions;
create policy partner_visibility_permissions_manage_related_admin
on public.partner_visibility_permissions
for all to authenticated
using (
  exists (
    select 1
    from public.organisation_partners op
    where op.id = partner_visibility_permissions.relationship_id
      and (
        public.bridge_is_org_admin(op.organisation_id)
        or public.bridge_is_org_admin(op.partner_organisation_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.organisation_partners op
    where op.id = partner_visibility_permissions.relationship_id
      and (
        public.bridge_is_org_admin(op.organisation_id)
        or public.bridge_is_org_admin(op.partner_organisation_id)
      )
  )
);

create or replace function public.get_bond_partner_people_phase2(p_relationship_id uuid)
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
  v_can_view_principal boolean := false;
  v_can_view_branch_managers boolean := false;
  v_can_view_agents boolean := false;
  v_principals jsonb := '[]'::jsonb;
  v_branch_managers jsonb := '[]'::jsonb;
  v_agents jsonb := '[]'::jsonb;
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
      and pvp.permission_key = 'can_view_principal'
      and pvp.is_enabled is true
  )
  into v_can_view_principal;

  select exists (
    select 1
    from public.partner_visibility_permissions pvp
    where pvp.relationship_id = p_relationship_id
      and pvp.permission_key = 'can_view_branch_managers'
      and pvp.is_enabled is true
  )
  into v_can_view_branch_managers;

  select exists (
    select 1
    from public.partner_visibility_permissions pvp
    where pvp.relationship_id = p_relationship_id
      and pvp.permission_key = 'can_view_agents'
      and pvp.is_enabled is true
  )
  into v_can_view_agents;

  if v_can_view_principal then
    select coalesce(jsonb_agg(person order by person->>'full_name'), '[]'::jsonb)
      into v_principals
      from (
        select jsonb_build_object(
          'user_id', ou.user_id,
          'full_name', coalesce(
            nullif(p.full_name, ''),
            nullif(trim(concat_ws(' ', ou.first_name, ou.last_name)), ''),
            nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
            nullif(ou.email, ''),
            nullif(p.email, ''),
            'Partner user'
          ),
          'email', coalesce(nullif(ou.email, ''), nullif(p.email, '')),
          'phone', nullif(p.phone_number, ''),
          'role', coalesce(nullif(ou.workspace_role, ''), nullif(ou.organisation_role, ''), nullif(ou.role, '')),
          'organisation_role', coalesce(nullif(ou.organisation_role, ''), nullif(ou.workspace_role, ''), nullif(ou.role, '')),
          'branch_id', b.id,
          'branch_name', b.name,
          'is_active', coalesce(ou.status, 'active') = 'active'
        ) as person
        from public.organisation_users ou
        left join public.profiles p on p.id = ou.user_id
        left join public.organisation_branches b
          on b.id = coalesce(ou.branch_id, ou.primary_branch_id)
         and b.organisation_id = ou.organisation_id
        where ou.organisation_id = v_partner_organisation_id
          and coalesce(ou.status, 'active') = 'active'
          and lower(coalesce(nullif(ou.workspace_role, ''), nullif(ou.organisation_role, ''), nullif(ou.role, ''))) in ('principal', 'owner', 'agency_principal')
      ) rows;
  end if;

  if v_can_view_branch_managers then
    select coalesce(jsonb_agg(person order by person->>'branch_name', person->>'full_name'), '[]'::jsonb)
      into v_branch_managers
      from (
        select jsonb_build_object(
          'user_id', ou.user_id,
          'full_name', coalesce(
            nullif(p.full_name, ''),
            nullif(trim(concat_ws(' ', ou.first_name, ou.last_name)), ''),
            nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
            nullif(ou.email, ''),
            nullif(p.email, ''),
            'Partner user'
          ),
          'email', coalesce(nullif(ou.email, ''), nullif(p.email, '')),
          'phone', nullif(p.phone_number, ''),
          'role', coalesce(nullif(ou.workspace_role, ''), nullif(ou.organisation_role, ''), nullif(ou.role, '')),
          'organisation_role', coalesce(nullif(ou.organisation_role, ''), nullif(ou.workspace_role, ''), nullif(ou.role, '')),
          'branch_id', b.id,
          'branch_name', b.name,
          'is_active', coalesce(ou.status, 'active') = 'active'
        ) as person
        from public.organisation_users ou
        left join public.profiles p on p.id = ou.user_id
        left join public.organisation_branches b
          on b.id = coalesce(ou.branch_id, ou.primary_branch_id)
         and b.organisation_id = ou.organisation_id
        where ou.organisation_id = v_partner_organisation_id
          and coalesce(ou.status, 'active') = 'active'
          and lower(coalesce(nullif(ou.workspace_role, ''), nullif(ou.organisation_role, ''), nullif(ou.role, ''))) in ('branch_manager', 'manager', 'agency_manager')
      ) rows;
  end if;

  if v_can_view_agents then
    select coalesce(jsonb_agg(person order by person->>'branch_name', person->>'full_name'), '[]'::jsonb)
      into v_agents
      from (
        select jsonb_build_object(
          'user_id', ou.user_id,
          'full_name', coalesce(
            nullif(p.full_name, ''),
            nullif(trim(concat_ws(' ', ou.first_name, ou.last_name)), ''),
            nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
            nullif(ou.email, ''),
            nullif(p.email, ''),
            'Partner user'
          ),
          'email', coalesce(nullif(ou.email, ''), nullif(p.email, '')),
          'phone', nullif(p.phone_number, ''),
          'role', coalesce(nullif(ou.workspace_role, ''), nullif(ou.organisation_role, ''), nullif(ou.role, '')),
          'organisation_role', coalesce(nullif(ou.organisation_role, ''), nullif(ou.workspace_role, ''), nullif(ou.role, '')),
          'branch_id', b.id,
          'branch_name', b.name,
          'is_active', coalesce(ou.status, 'active') = 'active'
        ) as person
        from public.organisation_users ou
        left join public.profiles p on p.id = ou.user_id
        left join public.organisation_branches b
          on b.id = coalesce(ou.branch_id, ou.primary_branch_id)
         and b.organisation_id = ou.organisation_id
        where ou.organisation_id = v_partner_organisation_id
          and coalesce(ou.status, 'active') = 'active'
          and lower(coalesce(nullif(ou.workspace_role, ''), nullif(ou.organisation_role, ''), nullif(ou.role, ''))) in ('agent', 'estate_agent', 'sales_agent')
      ) rows;
  end if;

  return jsonb_build_object(
    'relationship_id', p_relationship_id,
    'partner_organisation_id', v_partner_organisation_id,
    'permissions', jsonb_build_object(
      'can_view_principal', v_can_view_principal,
      'can_view_branch_managers', v_can_view_branch_managers,
      'can_view_agents', v_can_view_agents
    ),
    'groups', jsonb_build_object(
      'principal', v_principals,
      'branch_managers', v_branch_managers,
      'agents', v_agents
    )
  );
end;
$$;

grant select, insert, update, delete on public.partner_visibility_permissions to authenticated;
grant execute on function public.get_bond_partner_people_phase2(uuid) to authenticated;

commit;
