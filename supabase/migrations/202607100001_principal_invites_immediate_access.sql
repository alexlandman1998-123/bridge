begin;

create or replace function public.bridge_sync_principal_claim_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text;
  v_workspace_type text;
  v_profile public.profiles%rowtype;
  v_membership_id uuid;
  v_commercial_enabled boolean := false;
  v_now timestamptz := now();
begin
  if new.invite_type <> 'principal_claim_invite' then
    return new;
  end if;

  if new.status <> 'accepted' or coalesce(old.status, '') = 'accepted' then
    return new;
  end if;

  v_user_id := coalesce(new.accepted_by_user_id, new.invitee_user_id);
  v_email := lower(coalesce(new.email, ''));

  if v_user_id is null or new.target_workspace_id is null then
    return new;
  end if;

  select coalesce(type, 'agency')
  into v_workspace_type
  from public.organisations
  where id = new.target_workspace_id;

  if v_workspace_type is null then
    return new;
  end if;

  select exists (
    select 1
    from public.organisation_modules om
    where om.organisation_id = new.target_workspace_id
      and om.module_key = 'commercial'
      and coalesce(om.status, '') = 'active'
  )
  or exists (
    select 1
    from public.organisation_settings os
    where os.organisation_id = new.target_workspace_id
      and (
        lower(coalesce(os.settings_json->'enabledModules'->>'commercial', 'false')) = 'true'
        or lower(coalesce(os.settings_json->'commercialWorkspace'->>'status', '')) = 'active'
      )
  )
  into v_commercial_enabled;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id;

  select id
  into v_membership_id
  from public.organisation_users
  where organisation_id = new.target_workspace_id
    and (
      user_id = v_user_id
      or lower(coalesce(email, '')) = v_email
    )
  order by case when user_id = v_user_id then 0 else 1 end, created_at asc
  limit 1
  for update;

  if v_membership_id is not null then
    update public.organisation_users
    set
      user_id = v_user_id,
      first_name = coalesce(nullif(first_name, ''), nullif(coalesce(new.metadata->>'first_name', new.metadata->>'firstName', v_profile.first_name), '')),
      last_name = coalesce(nullif(last_name, ''), nullif(coalesce(new.metadata->>'last_name', new.metadata->>'lastName', new.metadata->>'surname', v_profile.last_name), '')),
      email = coalesce(nullif(v_email, ''), email),
      role = 'principal',
      workspace_role = 'principal',
      organisation_role = 'principal',
      organization_role = 'principal',
      app_role = 'agent',
      workspace_type = v_workspace_type,
      module_context = case when v_commercial_enabled then 'commercial' else module_context end,
      module_metadata = case
        when v_commercial_enabled then coalesce(module_metadata, '{}'::jsonb)
          || jsonb_build_object(
            'source', 'principal_invite_acceptance',
            'commercialAccessInheritedAt', v_now,
            'commercialAccessReason', 'principal_invite'
          )
        else module_metadata
      end,
      status = 'active',
      membership_status = 'active',
      invited_by_user_id = coalesce(invited_by_user_id, new.inviter_user_id),
      invited_at = coalesce(invited_at, new.created_at),
      accepted_at = coalesce(accepted_at, new.accepted_at, v_now),
      joined_at = coalesce(joined_at, new.accepted_at, v_now),
      active_workspace_selected_at = v_now,
      scope_metadata = coalesce(scope_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'principalClaimInviteId', new.id,
          'principalInviteAcceptedAt', coalesce(new.accepted_at, v_now),
          'principalInviteImmediateAccessAt', v_now,
          'source', 'principal_claim_invite'
        ),
      updated_at = v_now
    where id = v_membership_id;
  else
    insert into public.organisation_users (
      organisation_id,
      user_id,
      first_name,
      last_name,
      email,
      role,
      workspace_role,
      organisation_role,
      organization_role,
      app_role,
      workspace_type,
      module_context,
      module_metadata,
      status,
      membership_status,
      invited_by_user_id,
      invited_at,
      accepted_at,
      joined_at,
      active_workspace_selected_at,
      scope_metadata,
      created_by
    )
    values (
      new.target_workspace_id,
      v_user_id,
      nullif(coalesce(new.metadata->>'first_name', new.metadata->>'firstName', v_profile.first_name), ''),
      nullif(coalesce(new.metadata->>'last_name', new.metadata->>'lastName', new.metadata->>'surname', v_profile.last_name), ''),
      v_email,
      'principal',
      'principal',
      'principal',
      'principal',
      'agent',
      v_workspace_type,
      case when v_commercial_enabled then 'commercial' else null end,
      case
        when v_commercial_enabled then jsonb_build_object(
          'source', 'principal_invite_acceptance',
          'commercialAccessInheritedAt', v_now,
          'commercialAccessReason', 'principal_invite'
        )
        else '{}'::jsonb
      end,
      'active',
      'active',
      new.inviter_user_id,
      new.created_at,
      coalesce(new.accepted_at, v_now),
      coalesce(new.accepted_at, v_now),
      v_now,
      jsonb_build_object(
        'principalClaimInviteId', new.id,
        'principalInviteAcceptedAt', coalesce(new.accepted_at, v_now),
        'principalInviteImmediateAccessAt', v_now,
        'source', 'principal_claim_invite'
      ),
      new.inviter_user_id
    );
  end if;

  insert into public.user_workspace_preferences (
    user_id,
    active_workspace_id,
    active_workspace_source
  )
  values (
    v_user_id,
    new.target_workspace_id,
    'user_selected'
  )
  on conflict (user_id) do update
  set
    active_workspace_id = excluded.active_workspace_id,
    active_workspace_source = excluded.active_workspace_source,
    updated_at = v_now;

  update public.profiles
  set
    first_name = coalesce(nullif(first_name, ''), nullif(coalesce(new.metadata->>'first_name', new.metadata->>'firstName'), '')),
    last_name = coalesce(nullif(last_name, ''), nullif(coalesce(new.metadata->>'last_name', new.metadata->>'lastName', new.metadata->>'surname'), '')),
    phone_number = coalesce(nullif(phone_number, ''), nullif(coalesce(new.metadata->>'mobile', new.phone), '')),
    role = 'agent',
    onboarding_completed = true,
    updated_at = v_now
  where id = v_user_id;

  insert into public.onboarding_states (
    user_id,
    onboarding_status,
    onboarding_step,
    onboarding_path,
    workspace_action,
    workspace_type,
    app_role,
    intended_org_role,
    last_completed_step,
    onboarding_context_json,
    completed_at
  )
  values (
    v_user_id,
    'onboarding_completed',
    'onboarding_complete',
    'agency_owner',
    'claim_existing_workspace',
    'agency',
    'agent',
    'principal',
    'onboarding_review',
    jsonb_build_object(
      'principalClaimInviteId', new.id,
      'targetWorkspaceId', new.target_workspace_id,
      'source', 'principal_invite_acceptance'
    ),
    v_now
  )
  on conflict (user_id) do update
  set
    onboarding_status = 'onboarding_completed',
    onboarding_step = 'onboarding_complete',
    last_completed_step = 'onboarding_review',
    recovery_reason = null,
    onboarding_context_json = coalesce(public.onboarding_states.onboarding_context_json, '{}'::jsonb)
      || excluded.onboarding_context_json,
    completed_at = coalesce(public.onboarding_states.completed_at, v_now),
    updated_at = v_now;

  insert into public.onboarding_events (
    user_id,
    workspace_id,
    onboarding_step,
    event_type,
    metadata
  )
  values (
    v_user_id,
    new.target_workspace_id,
    'onboarding_complete',
    'principal_invite_accepted',
    jsonb_build_object('invite_id', new.id, 'source', 'principal_invite_acceptance')
  );

  update public.invites
  set
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'principal_invite_access_granted_at', v_now,
        'principal_invite_immediate_access', true
      ),
    updated_at = v_now
  where id = new.id;

  perform public.bridge_record_invite_event(
    new.id,
    'principal_invite_access_granted',
    v_user_id,
    jsonb_build_object('workspace_id', new.target_workspace_id)
  );

  return new;
end;
$$;

create or replace function public.bridge_sync_direct_principal_invite_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(new.accepted_by_user_id, new.invitee_user_id);
  v_email text := lower(nullif(trim(coalesce(new.email, '')), ''));
  v_membership_id uuid;
  v_now timestamptz := now();
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status <> 'accepted' or coalesce(old.status, '') = 'accepted' then
    return new;
  end if;

  if new.invite_type not in ('workspace_invite', 'workspace_and_transaction_invite', 'branch_invite', 'team_invite') then
    return new;
  end if;

  if lower(coalesce(new.target_workspace_role, '')) <> 'principal' then
    return new;
  end if;

  if new.target_workspace_id is null or v_user_id is null then
    return new;
  end if;

  select id
  into v_membership_id
  from public.organisation_users
  where organisation_id = new.target_workspace_id
    and (
      user_id = v_user_id
      or (v_email is not null and lower(coalesce(email, '')) = v_email)
    )
  order by case when status = 'active' then 0 else 1 end, created_at asc
  limit 1
  for update;

  if v_membership_id is null then
    return new;
  end if;

  update public.organisation_users
  set
    role = 'principal',
    workspace_role = 'principal',
    organisation_role = 'principal',
    organization_role = 'principal',
    status = 'active',
    membership_status = 'active',
    accepted_at = coalesce(accepted_at, new.accepted_at, v_now),
    joined_at = coalesce(joined_at, new.accepted_at, v_now),
    active_workspace_selected_at = coalesce(active_workspace_selected_at, v_now),
    scope_metadata = coalesce(scope_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'principalInviteId', new.id,
        'principalInviteAcceptedAt', coalesce(new.accepted_at, v_now),
        'source', 'principal_invite'
      ),
    updated_at = v_now
  where id = v_membership_id;

  update public.invites
  set
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'principal_invite_access_granted_at', v_now,
        'principal_invite_immediate_access', true
      ),
    updated_at = v_now
  where id = new.id;

  perform public.bridge_record_invite_event(
    new.id,
    'principal_invite_access_granted',
    v_user_id,
    jsonb_build_object('membership_id', v_membership_id, 'workspace_id', new.target_workspace_id)
  );

  return new;
end;
$$;

drop trigger if exists trg_bridge_sync_direct_principal_invite_membership on public.invites;
create trigger trg_bridge_sync_direct_principal_invite_membership
after update of status on public.invites
for each row
execute function public.bridge_sync_direct_principal_invite_membership();

commit;
