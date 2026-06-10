begin;

create or replace function public.bridge_sync_invite_branch_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(new.accepted_by_user_id, new.invitee_user_id);
  v_email text := lower(nullif(trim(coalesce(new.email, '')), ''));
  v_membership_id uuid;
  v_membership_role text;
  v_branch_role text := 'agent';
  v_branch_member_id uuid;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status <> 'accepted' then
    return new;
  end if;

  if old.status = 'accepted'
    and old.accepted_by_user_id is not distinct from new.accepted_by_user_id
    and old.invitee_user_id is not distinct from new.invitee_user_id
    and old.updated_at is not distinct from new.updated_at
  then
    return new;
  end if;

  if new.target_workspace_id is null or new.target_branch_id is null or v_user_id is null then
    return new;
  end if;

  if new.invite_type not in ('workspace_invite', 'workspace_and_transaction_invite', 'branch_invite', 'team_invite') then
    return new;
  end if;

  if to_regclass('public.branch_members') is null then
    return new;
  end if;

  select
    ou.id,
    coalesce(nullif(ou.workspace_role, ''), nullif(ou.organisation_role, ''), nullif(ou.role, 'agent'), 'agent')
  into v_membership_id, v_membership_role
  from public.organisation_users ou
  where ou.organisation_id = new.target_workspace_id
    and (
      ou.user_id = v_user_id
      or (v_email is not null and lower(coalesce(ou.email, '')) = v_email)
    )
    and coalesce(ou.primary_branch_id, ou.branch_id, new.target_branch_id) = new.target_branch_id
  order by case when ou.status = 'active' then 0 else 1 end, ou.created_at asc
  limit 1;

  if v_membership_id is null then
    return new;
  end if;

  v_branch_role := case
    when v_membership_role in ('owner', 'principal', 'director', 'partner') then 'principal'
    when v_membership_role in ('super_admin', 'admin', 'admin_staff') then 'admin'
    when v_membership_role in ('branch_manager', 'branch_admin', 'team_lead', 'manager') then 'manager'
    when v_membership_role in ('assistant', 'transaction_coordinator', 'listing_coordinator', 'admin_coordinator') then 'assistant'
    else 'agent'
  end;

  insert into public.branch_members (
    branch_id,
    organisation_user_id,
    user_id,
    role,
    status,
    invited_by,
    invited_at,
    accepted_at,
    updated_at
  )
  values (
    new.target_branch_id,
    v_membership_id,
    v_user_id,
    v_branch_role,
    'active',
    new.inviter_user_id,
    new.created_at,
    coalesce(new.accepted_at, now()),
    now()
  )
  on conflict (branch_id, user_id) do update
  set organisation_user_id = coalesce(public.branch_members.organisation_user_id, excluded.organisation_user_id),
      role = excluded.role,
      status = 'active',
      invited_by = coalesce(public.branch_members.invited_by, excluded.invited_by),
      invited_at = coalesce(public.branch_members.invited_at, excluded.invited_at),
      accepted_at = coalesce(public.branch_members.accepted_at, excluded.accepted_at),
      updated_at = now()
  returning id into v_branch_member_id;

  perform public.bridge_record_invite_event(
    new.id,
    'branch_member_synced_from_invite',
    v_user_id,
    jsonb_build_object(
      'membership_id', v_membership_id,
      'branch_member_id', v_branch_member_id,
      'branch_id', new.target_branch_id,
      'branch_role', v_branch_role
    )
  );

  return new;
end;
$$;

drop trigger if exists invites_sync_branch_member on public.invites;
create trigger invites_sync_branch_member
after update of status, accepted_by_user_id, invitee_user_id
on public.invites
for each row
execute function public.bridge_sync_invite_branch_member();

do $$
begin
  if to_regclass('public.branch_members') is not null then
    update public.invites
    set status = status,
        updated_at = now()
    where status = 'accepted'
      and target_workspace_id is not null
      and target_branch_id is not null
      and invite_type in ('workspace_invite', 'workspace_and_transaction_invite', 'branch_invite', 'team_invite');
  end if;
end;
$$;

commit;
