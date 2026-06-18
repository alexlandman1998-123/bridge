begin;

alter table if exists public.organisation_users
  add column if not exists module_context text,
  add column if not exists module_metadata jsonb not null default '{}'::jsonb;

create index if not exists organisation_users_commercial_invite_module_idx
  on public.organisation_users (organisation_id, user_id, module_context)
  where module_context in ('commercial', 'commercial_brokerage', 'commercial_agency');

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
    new.target_workspace_role,
    new.metadata->>'commercial_role',
    new.metadata->>'role',
    new.metadata->>'workspace_role',
    new.metadata->>'organisation_role',
    ''
  )), ''));
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
  then
    return new;
  end if;

  update public.organisation_users
  set
    module_context = 'commercial',
    module_metadata = coalesce(module_metadata, '{}'::jsonb) || jsonb_build_object(
      'module', 'commercial',
      'module_context', 'commercial',
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

drop trigger if exists bridge_apply_commercial_invite_membership_marker_on_accept on public.invites;

create trigger bridge_apply_commercial_invite_membership_marker_on_accept
after update of status on public.invites
for each row
execute function public.bridge_apply_commercial_invite_membership_marker();

with accepted_commercial_invites as (
  select
    id,
    target_workspace_id,
    accepted_by_user_id,
    invitee_user_id,
    email,
    accepted_at,
    lower(nullif(trim(coalesce(
      target_workspace_role,
      metadata->>'commercial_role',
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
      or lower(nullif(trim(coalesce(
        target_workspace_role,
        metadata->>'commercial_role',
        metadata->>'role',
        metadata->>'workspace_role',
        metadata->>'organisation_role',
        ''
      )), '')) like 'commercial_%'
    )
)
update public.organisation_users ou
set
  module_context = 'commercial',
  module_metadata = coalesce(ou.module_metadata, '{}'::jsonb) || jsonb_build_object(
    'module', 'commercial',
    'module_context', 'commercial',
    'source', 'workspace_invite_backfill',
    'invite_id', aci.id,
    'invite_role', coalesce(aci.invite_role, ''),
    'accepted_from_invite_at', coalesce(aci.accepted_at, now())
  ),
  updated_at = now()
from accepted_commercial_invites aci
where ou.organisation_id = aci.target_workspace_id
  and (
    (aci.accepted_by_user_id is not null and ou.user_id = aci.accepted_by_user_id)
    or (aci.invitee_user_id is not null and ou.user_id = aci.invitee_user_id)
    or (coalesce(aci.email, '') <> '' and lower(coalesce(ou.email, '')) = lower(aci.email))
  );

commit;
