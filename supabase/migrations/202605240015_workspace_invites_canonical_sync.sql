begin;

create or replace function public.bridge_workspace_invite_type(workspace_type text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(workspace_type, '') = 'agency' then 'workspace_invite'
    else 'workspace_invite'
  end;
$$;

insert into public.invites (
  invite_type,
  status,
  token,
  expires_at,
  inviter_user_id,
  target_workspace_id,
  target_workspace_role,
  target_branch_id,
  email,
  metadata,
  accepted_at,
  accepted_by_user_id,
  created_at,
  updated_at
)
select
  public.bridge_workspace_invite_type(wi.workspace_type),
  case
    when wi.status = 'accepted' then 'accepted'
    when wi.status = 'revoked' then 'revoked'
    when wi.status = 'expired' then 'expired'
    else 'pending'
  end,
  wi.token,
  wi.expires_at,
  wi.invited_by,
  wi.workspace_id,
  wi.organisation_role,
  wi.branch_id,
  lower(wi.invited_email),
  jsonb_build_object(
    'source', 'workspace_invites_compat',
    'legacy_workspace_invite_id', wi.id,
    'workspace_type', wi.workspace_type,
    'app_role', wi.app_role
  ),
  wi.accepted_at,
  wi.accepted_by,
  wi.created_at,
  wi.updated_at
from public.workspace_invites wi
where wi.token is not null
on conflict (token)
do update set
  invite_type = excluded.invite_type,
  status = excluded.status,
  expires_at = excluded.expires_at,
  inviter_user_id = excluded.inviter_user_id,
  target_workspace_id = excluded.target_workspace_id,
  target_workspace_role = excluded.target_workspace_role,
  target_branch_id = excluded.target_branch_id,
  email = excluded.email,
  metadata = coalesce(public.invites.metadata, '{}'::jsonb) || excluded.metadata,
  accepted_at = excluded.accepted_at,
  accepted_by_user_id = excluded.accepted_by_user_id,
  updated_at = now();

create or replace function public.bridge_sync_workspace_invite_to_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.invites (
    invite_type,
    status,
    token,
    expires_at,
    inviter_user_id,
    target_workspace_id,
    target_workspace_role,
    target_branch_id,
    email,
    metadata,
    accepted_at,
    accepted_by_user_id,
    created_at,
    updated_at
  )
  values (
    public.bridge_workspace_invite_type(new.workspace_type),
    case
      when new.status = 'accepted' then 'accepted'
      when new.status = 'revoked' then 'revoked'
      when new.status = 'expired' then 'expired'
      else 'pending'
    end,
    new.token,
    new.expires_at,
    new.invited_by,
    new.workspace_id,
    new.organisation_role,
    new.branch_id,
    lower(new.invited_email),
    jsonb_build_object(
      'source', 'workspace_invites_compat',
      'legacy_workspace_invite_id', new.id,
      'workspace_type', new.workspace_type,
      'app_role', new.app_role
    ),
    new.accepted_at,
    new.accepted_by,
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now())
  )
  on conflict (token)
  do update set
    invite_type = excluded.invite_type,
    status = excluded.status,
    expires_at = excluded.expires_at,
    inviter_user_id = excluded.inviter_user_id,
    target_workspace_id = excluded.target_workspace_id,
    target_workspace_role = excluded.target_workspace_role,
    target_branch_id = excluded.target_branch_id,
    email = excluded.email,
    metadata = coalesce(public.invites.metadata, '{}'::jsonb) || excluded.metadata,
    accepted_at = excluded.accepted_at,
    accepted_by_user_id = excluded.accepted_by_user_id,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists workspace_invites_sync_to_invites on public.workspace_invites;
create trigger workspace_invites_sync_to_invites
after insert or update of token, status, expires_at, invited_by, workspace_id, organisation_role, branch_id, invited_email, accepted_at, accepted_by
on public.workspace_invites
for each row
execute function public.bridge_sync_workspace_invite_to_invites();

commit;
