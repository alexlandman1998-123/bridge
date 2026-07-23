begin;

create or replace function public.bridge_organisation_role_authority_level(p_role text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case lower(trim(coalesce(p_role, '')))
    when 'owner' then 500
    when 'super_admin' then 500
    when 'director' then 400
    when 'partner' then 400
    when 'principal' then 400
    when 'admin' then 400
    when 'hq_manager' then 400
    when 'regional_manager' then 350
    when 'branch_manager' then 300
    when 'manager' then 200
    when 'team_lead' then 200
    when 'sales_manager' then 200
    when 'development_manager' then 200
    when 'senior_agent' then 100
    when 'sales_agent' then 100
    when 'agent' then 100
    when 'attorney' then 100
    when 'conveyancer' then 100
    when 'bond_originator' then 100
    when 'consultant' then 100
    when 'processor' then 100
    when 'compliance' then 100
    when 'assistant' then 50
    when 'transaction_coordinator' then 50
    when 'listing_coordinator' then 50
    when 'admin_coordinator' then 50
    when 'admin_staff' then 50
    when 'paralegal' then 50
    else 0
  end;
$$;

create or replace function public.bridge_guard_organisation_user_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.organisation_users%rowtype;
  v_previous_role text;
  v_next_role text;
  v_actor_level integer;
  v_previous_level integer;
  v_next_level integer;
begin
  if new.role is not distinct from old.role
    and new.workspace_role is not distinct from old.workspace_role
    and new.organisation_role is not distinct from old.organisation_role
    and new.organization_role is not distinct from old.organization_role then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  select * into v_actor
  from public.organisation_users actor
  where actor.organisation_id = old.organisation_id
    and actor.user_id = auth.uid()
    and coalesce(actor.membership_status, actor.status) = 'active'
  order by actor.is_primary_owner desc,
           actor.updated_at desc nulls last,
           actor.created_at desc
  limit 1;

  if v_actor.id is null then
    raise exception 'An active organisation membership is required to change roles.' using errcode = '42501';
  end if;
  if v_actor.id = old.id or (old.user_id is not null and old.user_id = auth.uid()) then
    raise exception 'You cannot change your own organisation role.' using errcode = '42501';
  end if;

  v_previous_role := lower(trim(coalesce(old.workspace_role, old.organisation_role, old.organization_role, old.role, 'viewer')));
  v_next_role := lower(trim(coalesce(
    case when new.workspace_role is distinct from old.workspace_role then new.workspace_role end,
    case when new.organisation_role is distinct from old.organisation_role then new.organisation_role end,
    case when new.organization_role is distinct from old.organization_role then new.organization_role end,
    case when new.role is distinct from old.role then new.role end,
    new.workspace_role,
    new.organisation_role,
    new.organization_role,
    new.role,
    'viewer'
  )));

  v_actor_level := public.bridge_organisation_role_authority_level(
    coalesce(v_actor.workspace_role, v_actor.organisation_role, v_actor.organization_role, v_actor.role)
  );
  v_previous_level := public.bridge_organisation_role_authority_level(v_previous_role);
  v_next_level := public.bridge_organisation_role_authority_level(v_next_role);

  if v_actor_level < 400 then
    raise exception 'Only an organisation owner or principal can change roles.' using errcode = '42501';
  end if;
  if v_previous_level >= v_actor_level then
    raise exception 'You cannot change the role of a peer or higher-authority member.' using errcode = '42501';
  end if;
  if v_next_level >= v_actor_level then
    raise exception 'You cannot assign a role at or above your own authority level.' using errcode = '42501';
  end if;
  if v_next_role in ('owner', 'super_admin') then
    raise exception 'Owner role changes must use the ownership transfer flow.' using errcode = '42501';
  end if;

  new.role := v_next_role;
  new.workspace_role := v_next_role;
  new.organisation_role := v_next_role;
  new.organization_role := v_next_role;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists aaa_bridge_guard_organisation_user_role_change on public.organisation_users;
create trigger aaa_bridge_guard_organisation_user_role_change
before update of role, workspace_role, organisation_role, organization_role on public.organisation_users
for each row
execute function public.bridge_guard_organisation_user_role_change();

create or replace function public.bridge_set_organisation_user_role(
  p_membership_id uuid,
  p_role text
)
returns public.organisation_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.organisation_users%rowtype;
  v_role text := lower(trim(coalesce(p_role, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if v_role = '' then
    raise exception 'A role is required.' using errcode = '22023';
  end if;

  select * into v_target
  from public.organisation_users
  where id = p_membership_id;

  if v_target.id is null then
    raise exception 'Organisation user not found.' using errcode = 'P0002';
  end if;

  update public.organisation_users
  set role = v_role,
      workspace_role = v_role,
      organisation_role = v_role,
      organization_role = v_role,
      updated_at = now()
  where id = v_target.id
  returning * into v_target;

  return v_target;
end;
$$;

revoke all on function public.bridge_set_organisation_user_role(uuid, text) from public;
grant execute on function public.bridge_set_organisation_user_role(uuid, text) to authenticated;

commit;
