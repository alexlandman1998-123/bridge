begin;

alter table if exists public.organisation_users
  add column if not exists platform_role text,
  add column if not exists commercial_role text;

alter table if exists public.commercial_access_requests
  add column if not exists platform_role text,
  add column if not exists commercial_role text;

do $$
begin
  if to_regclass('public.organisation_users') is not null then
    create index if not exists organisation_users_commercial_role_idx
      on public.organisation_users (organisation_id, commercial_role)
      where platform_role = 'commercial'
        or commercial_role is not null
        or module_context in ('commercial', 'commercial_brokerage', 'commercial_agency');
  end if;

  if to_regclass('public.commercial_access_requests') is not null then
    create index if not exists commercial_access_requests_role_idx
      on public.commercial_access_requests (organisation_id, platform_role, commercial_role, status, created_at desc)
      where module_key = 'commercial';
  end if;
end;
$$;

with commercial_memberships as (
  select
    ou.id,
    case
      when lower(nullif(trim(coalesce(ou.commercial_role, ou.module_metadata->>'commercial_role', ou.module_metadata->>'broker_role', '')), '')) in ('commercial_principal', 'commercial_director') then lower(nullif(trim(coalesce(ou.commercial_role, ou.module_metadata->>'commercial_role', ou.module_metadata->>'broker_role', '')), ''))
      when lower(nullif(trim(coalesce(ou.commercial_role, ou.module_metadata->>'commercial_role', ou.module_metadata->>'broker_role', '')), '')) = 'commercial_admin' then 'commercial_admin'
      when lower(nullif(trim(coalesce(ou.commercial_role, ou.module_metadata->>'commercial_role', ou.module_metadata->>'broker_role', '')), '')) in ('commercial_hq_admin', 'commercial_hq_manager') then 'commercial_hq_manager'
      when lower(nullif(trim(coalesce(ou.commercial_role, ou.module_metadata->>'commercial_role', ou.module_metadata->>'broker_role', '')), '')) = 'commercial_branch_admin' then 'commercial_branch_admin'
      when lower(nullif(trim(coalesce(ou.commercial_role, ou.module_metadata->>'commercial_role', ou.module_metadata->>'broker_role', '')), '')) = 'commercial_branch_manager' then 'commercial_branch_manager'
      when lower(nullif(trim(coalesce(ou.commercial_role, ou.module_metadata->>'commercial_role', ou.module_metadata->>'broker_role', '')), '')) = 'commercial_team_leader' then 'commercial_team_leader'
      when lower(nullif(trim(coalesce(ou.commercial_role, ou.module_metadata->>'commercial_role', ou.module_metadata->>'broker_role', '')), '')) in ('commercial_broker', 'broker') then 'commercial_broker'
      when lower(nullif(trim(coalesce(ou.commercial_role, ou.module_metadata->>'commercial_role', ou.module_metadata->>'broker_role', '')), '')) = 'senior_commercial_broker' then 'senior_commercial_broker'
      when lower(nullif(trim(coalesce(ou.workspace_role, ou.organisation_role, ou.role, '')), '')) in ('owner', 'principal', 'director', 'partner') then 'commercial_principal'
      when lower(nullif(trim(coalesce(ou.workspace_role, ou.organisation_role, ou.role, '')), '')) in ('admin', 'super_admin', 'commercial_admin', 'admin_staff') then 'commercial_admin'
      when lower(nullif(trim(coalesce(ou.workspace_role, ou.organisation_role, ou.role, '')), '')) in ('manager', 'hq_manager', 'commercial_hq_admin', 'commercial_hq_manager') then 'commercial_hq_manager'
      when lower(nullif(trim(coalesce(ou.workspace_role, ou.organisation_role, ou.role, '')), '')) in ('branch_manager', 'commercial_branch_manager', 'branch_admin', 'regional_manager') then 'commercial_branch_manager'
      when lower(nullif(trim(coalesce(ou.workspace_role, ou.organisation_role, ou.role, '')), '')) = 'commercial_branch_admin' then 'commercial_branch_admin'
      when lower(nullif(trim(coalesce(ou.workspace_role, ou.organisation_role, ou.role, '')), '')) in ('team_leader', 'team_manager', 'commercial_team_leader') then 'commercial_team_leader'
      when lower(nullif(trim(coalesce(ou.workspace_role, ou.organisation_role, ou.role, '')), '')) in ('broker', 'commercial_broker', 'agent') then 'commercial_broker'
      when lower(nullif(trim(coalesce(ou.workspace_role, ou.organisation_role, ou.role, '')), '')) = 'senior_agent' then 'senior_commercial_broker'
      else null
    end as target_commercial_role
  from public.organisation_users ou
  where coalesce(ou.status, 'active') not in ('deactivated', 'removed')
    and (
      coalesce(ou.module_context, '') in ('commercial', 'commercial_brokerage', 'commercial_agency')
      or coalesce(ou.workspace_type, '') in ('commercial', 'commercial_brokerage', 'commercial_agency')
      or coalesce(ou.platform_role, '') = 'commercial'
      or ou.commercial_role is not null
      or coalesce(ou.module_metadata->>'platform_role', '') = 'commercial'
      or coalesce(ou.module_metadata->>'module_context', '') in ('commercial', 'commercial_brokerage', 'commercial_agency')
      or coalesce(ou.module_metadata->>'module', '') in ('commercial', 'commercial_brokerage', 'commercial_agency')
      or coalesce(ou.module_metadata->>'commercial_role', '') <> ''
      or coalesce(ou.module_metadata->>'broker_role', '') <> ''
      or coalesce(ou.workspace_role, ou.organisation_role, ou.role, '') like 'commercial_%'
    )
)
update public.organisation_users ou
set
  platform_role = coalesce(nullif(ou.platform_role, ''), 'commercial'),
  commercial_role = coalesce(nullif(ou.commercial_role, ''), cm.target_commercial_role),
  module_metadata = coalesce(ou.module_metadata, '{}'::jsonb) || jsonb_build_object(
    'platform_role', coalesce(nullif(ou.platform_role, ''), 'commercial'),
    'commercial_role', coalesce(nullif(ou.commercial_role, ''), cm.target_commercial_role),
    'commercial_role_source', 'phase1_backfill'
  ),
  updated_at = now()
from commercial_memberships cm
where ou.id = cm.id
  and cm.target_commercial_role is not null
  and (
    ou.platform_role is null
    or ou.platform_role = ''
    or ou.commercial_role is null
    or ou.commercial_role = ''
  );

with request_roles as (
  select
    car.id,
    coalesce(
      nullif(trim(car.commercial_role), ''),
      nullif(trim(car.metadata->>'commercial_role'), ''),
      nullif(trim(car.metadata->>'broker_role'), ''),
      nullif(trim(ou.commercial_role), ''),
      nullif(trim(ou.module_metadata->>'commercial_role'), ''),
      'commercial_broker'
    ) as raw_role
  from public.commercial_access_requests car
  left join public.organisation_users ou
    on ou.id = car.requester_membership_id
  where car.module_key = 'commercial'
)
update public.commercial_access_requests car
set
  platform_role = coalesce(nullif(car.platform_role, ''), 'commercial'),
  commercial_role = case
    when lower(rr.raw_role) in ('owner', 'principal', 'director', 'partner', 'commercial_principal') then 'commercial_principal'
    when lower(rr.raw_role) = 'commercial_director' then 'commercial_director'
    when lower(rr.raw_role) in ('admin', 'super_admin', 'commercial_admin', 'admin_staff') then 'commercial_admin'
    when lower(rr.raw_role) in ('manager', 'hq_manager', 'commercial_hq_admin', 'commercial_hq_manager') then 'commercial_hq_manager'
    when lower(rr.raw_role) in ('branch_manager', 'commercial_branch_manager', 'branch_admin', 'regional_manager') then 'commercial_branch_manager'
    when lower(rr.raw_role) = 'commercial_branch_admin' then 'commercial_branch_admin'
    when lower(rr.raw_role) in ('team_leader', 'team_manager', 'commercial_team_leader') then 'commercial_team_leader'
    when lower(rr.raw_role) in ('senior_agent', 'senior_commercial_broker') then 'senior_commercial_broker'
    else 'commercial_broker'
  end,
  metadata = coalesce(car.metadata, '{}'::jsonb) || jsonb_build_object(
    'platform_role', 'commercial',
    'commercial_role', case
      when lower(rr.raw_role) in ('owner', 'principal', 'director', 'partner', 'commercial_principal') then 'commercial_principal'
      when lower(rr.raw_role) = 'commercial_director' then 'commercial_director'
      when lower(rr.raw_role) in ('admin', 'super_admin', 'commercial_admin', 'admin_staff') then 'commercial_admin'
      when lower(rr.raw_role) in ('manager', 'hq_manager', 'commercial_hq_admin', 'commercial_hq_manager') then 'commercial_hq_manager'
      when lower(rr.raw_role) in ('branch_manager', 'commercial_branch_manager', 'branch_admin', 'regional_manager') then 'commercial_branch_manager'
      when lower(rr.raw_role) = 'commercial_branch_admin' then 'commercial_branch_admin'
      when lower(rr.raw_role) in ('team_leader', 'team_manager', 'commercial_team_leader') then 'commercial_team_leader'
      when lower(rr.raw_role) in ('senior_agent', 'senior_commercial_broker') then 'senior_commercial_broker'
      else 'commercial_broker'
    end
  ),
  updated_at = now()
from request_roles rr
where car.id = rr.id
  and (
    car.platform_role is null
    or car.platform_role = ''
    or car.commercial_role is null
    or car.commercial_role = ''
  );

create or replace function public.bridge_commercial_user_scope(target_organisation_id uuid)
returns table(scope_level text, branch_id uuid, team_id uuid, user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when lower(coalesce(nullif(ou.commercial_role, ''), ou.module_metadata->>'commercial_role', ou.workspace_role, ou.organisation_role, ou.role, '')) in ('owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'manager', 'hq_manager', 'commercial_principal', 'commercial_director', 'commercial_admin', 'commercial_hq_admin', 'commercial_hq_manager', 'super_admin') then 'organisation'
      when lower(coalesce(nullif(ou.commercial_role, ''), ou.module_metadata->>'commercial_role', ou.workspace_role, ou.organisation_role, ou.role, '')) in ('branch_manager', 'branch_admin', 'regional_manager', 'commercial_branch_manager', 'commercial_branch_admin') then 'branch'
      when lower(coalesce(nullif(ou.commercial_role, ''), ou.module_metadata->>'commercial_role', ou.workspace_role, ou.organisation_role, ou.role, '')) in ('team_leader', 'team_manager', 'commercial_team_leader') then 'team'
      else 'broker'
    end as scope_level,
    coalesce(ou.primary_branch_id, ou.branch_id) as branch_id,
    ou.team_id,
    ou.user_id
  from public.organisation_users ou
  where ou.organisation_id = target_organisation_id
    and ou.user_id = auth.uid()
    and coalesce(ou.status, 'active') not in ('deactivated', 'removed')
    and (
      coalesce(ou.module_context, '') in ('commercial', 'commercial_brokerage', 'commercial_agency')
      or coalesce(ou.workspace_type, '') in ('commercial', 'commercial_brokerage', 'commercial_agency')
      or coalesce(ou.platform_role, '') = 'commercial'
      or coalesce(ou.commercial_role, '') <> ''
      or coalesce(ou.module_metadata->>'platform_role', '') = 'commercial'
      or coalesce(ou.module_metadata->>'commercial_role', '') <> ''
      or coalesce(ou.workspace_role, ou.organisation_role, ou.role, '') like 'commercial_%'
    )
  limit 1
$$;

create or replace function public.bridge_apply_commercial_invite_membership_marker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module_context text := lower(nullif(trim(coalesce(
    new.metadata->>'module_context',
    new.metadata->>'moduleContext',
    new.metadata->>'module',
    new.metadata->>'module_type',
    new.metadata->>'workspace_module',
    ''
  )), ''));
  v_invite_role text := lower(nullif(trim(coalesce(
    new.metadata->>'commercial_role',
    new.metadata->>'broker_role',
    new.target_workspace_role,
    new.metadata->>'role',
    new.metadata->>'workspace_role',
    new.metadata->>'organisation_role',
    ''
  )), ''));
  v_commercial_role text;
begin
  if new.status is distinct from 'accepted' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'accepted' then
    return new;
  end if;

  if new.target_workspace_id is null then
    return new;
  end if;

  if new.invite_type not in ('workspace_invite', 'workspace_and_transaction_invite', 'branch_invite', 'team_invite') then
    return new;
  end if;

  if coalesce(v_module_context, '') not in ('commercial', 'commercial_brokerage', 'commercial_agency')
    and coalesce(v_invite_role, '') not like 'commercial_%'
    and coalesce(new.metadata->>'platform_role', '') <> 'commercial'
  then
    return new;
  end if;

  v_commercial_role := case
    when v_invite_role in ('owner', 'principal', 'director', 'partner', 'commercial_principal') then 'commercial_principal'
    when v_invite_role = 'commercial_director' then 'commercial_director'
    when v_invite_role in ('admin', 'super_admin', 'commercial_admin', 'admin_staff') then 'commercial_admin'
    when v_invite_role in ('manager', 'hq_manager', 'commercial_hq_admin', 'commercial_hq_manager') then 'commercial_hq_manager'
    when v_invite_role in ('branch_manager', 'commercial_branch_manager', 'branch_admin', 'regional_manager') then 'commercial_branch_manager'
    when v_invite_role = 'commercial_branch_admin' then 'commercial_branch_admin'
    when v_invite_role in ('team_leader', 'team_manager', 'commercial_team_leader') then 'commercial_team_leader'
    when v_invite_role in ('senior_agent', 'senior_commercial_broker') then 'senior_commercial_broker'
    else 'commercial_broker'
  end;

  update public.organisation_users
  set
    module_context = 'commercial',
    platform_role = 'commercial',
    commercial_role = coalesce(nullif(commercial_role, ''), v_commercial_role),
    module_metadata = coalesce(module_metadata, '{}'::jsonb) || jsonb_build_object(
      'module', 'commercial',
      'module_context', 'commercial',
      'platform_role', 'commercial',
      'commercial_role', coalesce(nullif(commercial_role, ''), v_commercial_role),
      'source', 'workspace_invite',
      'invite_id', new.id,
      'invite_role', coalesce(v_invite_role, ''),
      'accepted_from_invite_at', coalesce(new.accepted_at, now())
    ),
    updated_at = now()
  where organisation_id = new.target_workspace_id
    and (
      (new.accepted_by_user_id is not null and user_id = new.accepted_by_user_id)
      or (new.invitee_user_id is not null and user_id = new.invitee_user_id)
      or (coalesce(new.email, '') <> '' and lower(coalesce(email, '')) = lower(new.email))
    );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.invites') is not null then
    drop trigger if exists bridge_apply_commercial_invite_membership_marker_on_accept on public.invites;
    create trigger bridge_apply_commercial_invite_membership_marker_on_accept
    after update of status on public.invites
    for each row
    execute function public.bridge_apply_commercial_invite_membership_marker();
  end if;
end;
$$;

with accepted_commercial_invites as (
  select
    id,
    target_workspace_id,
    accepted_by_user_id,
    invitee_user_id,
    email,
    accepted_at,
    lower(nullif(trim(coalesce(
      metadata->>'commercial_role',
      metadata->>'broker_role',
      target_workspace_role,
      metadata->>'role',
      metadata->>'workspace_role',
      metadata->>'organisation_role',
      ''
    )), '')) as invite_role
  from public.invites
  where status = 'accepted'
    and target_workspace_id is not null
    and invite_type in ('workspace_invite', 'workspace_and_transaction_invite', 'branch_invite', 'team_invite')
    and (
      lower(nullif(trim(coalesce(
        metadata->>'module_context',
        metadata->>'moduleContext',
        metadata->>'module',
        metadata->>'module_type',
        metadata->>'workspace_module',
        ''
      )), '')) in ('commercial', 'commercial_brokerage', 'commercial_agency')
      or coalesce(metadata->>'platform_role', '') = 'commercial'
      or lower(nullif(trim(coalesce(
        metadata->>'commercial_role',
        metadata->>'broker_role',
        target_workspace_role,
        metadata->>'role',
        metadata->>'workspace_role',
        metadata->>'organisation_role',
        ''
      )), '')) like 'commercial_%'
    )
),
accepted_commercial_roles as (
  select
    *,
    case
      when invite_role in ('owner', 'principal', 'director', 'partner', 'commercial_principal') then 'commercial_principal'
      when invite_role = 'commercial_director' then 'commercial_director'
      when invite_role in ('admin', 'super_admin', 'commercial_admin', 'admin_staff') then 'commercial_admin'
      when invite_role in ('manager', 'hq_manager', 'commercial_hq_admin', 'commercial_hq_manager') then 'commercial_hq_manager'
      when invite_role in ('branch_manager', 'commercial_branch_manager', 'branch_admin', 'regional_manager') then 'commercial_branch_manager'
      when invite_role = 'commercial_branch_admin' then 'commercial_branch_admin'
      when invite_role in ('team_leader', 'team_manager', 'commercial_team_leader') then 'commercial_team_leader'
      when invite_role in ('senior_agent', 'senior_commercial_broker') then 'senior_commercial_broker'
      else 'commercial_broker'
    end as commercial_role
  from accepted_commercial_invites
)
update public.organisation_users ou
set
  module_context = 'commercial',
  platform_role = 'commercial',
  commercial_role = coalesce(nullif(ou.commercial_role, ''), acr.commercial_role),
  module_metadata = coalesce(ou.module_metadata, '{}'::jsonb) || jsonb_build_object(
    'module', 'commercial',
    'module_context', 'commercial',
    'platform_role', 'commercial',
    'commercial_role', coalesce(nullif(ou.commercial_role, ''), acr.commercial_role),
    'source', 'workspace_invite_backfill',
    'invite_id', acr.id,
    'invite_role', coalesce(acr.invite_role, ''),
    'accepted_from_invite_at', coalesce(acr.accepted_at, now())
  ),
  updated_at = now()
from accepted_commercial_roles acr
where ou.organisation_id = acr.target_workspace_id
  and (
    (acr.accepted_by_user_id is not null and ou.user_id = acr.accepted_by_user_id)
    or (acr.invitee_user_id is not null and ou.user_id = acr.invitee_user_id)
    or (coalesce(acr.email, '') <> '' and lower(coalesce(ou.email, '')) = lower(acr.email))
  );

commit;
