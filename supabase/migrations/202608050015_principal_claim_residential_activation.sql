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
  v_workspace_name text;
  v_profile public.profiles%rowtype;
  v_membership_id uuid;
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

  select coalesce(type, 'agency'), coalesce(nullif(display_name, ''), name)
  into v_workspace_type, v_workspace_name
  from public.organisations
  where id = new.target_workspace_id;

  if v_workspace_type is null then
    return new;
  end if;

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
      email = coalesce(nullif(email, ''), v_email),
      role = 'principal',
      workspace_role = 'principal',
      organisation_role = 'principal',
      organization_role = 'principal',
      app_role = 'agent',
      workspace_type = v_workspace_type,
      module_context = null,
      module_metadata = coalesce(module_metadata, '{}'::jsonb)
        - 'commercialAccessInheritedAt'
        - 'commercialAccessReason'
        - 'commercialRole'
        - 'commercial_role',
      status = 'active',
      membership_status = 'active',
      invited_by_user_id = coalesce(invited_by_user_id, new.inviter_user_id),
      invited_at = coalesce(invited_at, new.created_at),
      accepted_at = coalesce(accepted_at, new.accepted_at, now()),
      joined_at = coalesce(joined_at, new.accepted_at, now()),
      active_workspace_selected_at = coalesce(active_workspace_selected_at, new.accepted_at, now()),
      scope_metadata = coalesce(scope_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'principalClaimInviteId', new.id,
          'principalClaimAcceptedAt', coalesce(new.accepted_at, now()),
          'principalClaimStatus', 'accepted',
          'source', 'principal_claim_invite'
        ),
      updated_at = now()
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
      null,
      jsonb_build_object('source', 'principal_claim_invite'),
      'active',
      'active',
      new.inviter_user_id,
      new.created_at,
      coalesce(new.accepted_at, now()),
      coalesce(new.accepted_at, now()),
      coalesce(new.accepted_at, now()),
      jsonb_build_object(
        'principalClaimInviteId', new.id,
        'principalClaimAcceptedAt', coalesce(new.accepted_at, now()),
        'principalClaimStatus', 'accepted',
        'source', 'principal_claim_invite'
      ),
      new.inviter_user_id
    );
  end if;

  update public.profiles
  set
    first_name = coalesce(nullif(first_name, ''), nullif(coalesce(new.metadata->>'first_name', new.metadata->>'firstName'), '')),
    last_name = coalesce(nullif(last_name, ''), nullif(coalesce(new.metadata->>'last_name', new.metadata->>'lastName', new.metadata->>'surname'), '')),
    phone_number = coalesce(nullif(phone_number, ''), nullif(coalesce(new.metadata->>'mobile', new.phone), '')),
    role = 'agent',
    system_role = coalesce(nullif(system_role, ''), 'professional'),
    onboarding_completed = true,
    updated_at = now()
  where id = v_user_id;

  insert into public.user_workspace_preferences (
    user_id,
    active_workspace_id,
    active_workspace_source
  )
  values (
    v_user_id,
    new.target_workspace_id,
    'principal_claim_completed'
  )
  on conflict (user_id) do update
  set
    active_workspace_id = excluded.active_workspace_id,
    active_workspace_source = excluded.active_workspace_source,
    updated_at = now();

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
    'accept_invite',
    'agency',
    'agent',
    'principal',
    'workspace_invite_accepted',
    jsonb_build_object(
      'principalClaimInviteId', new.id,
      'targetWorkspaceId', new.target_workspace_id,
      'organisationName', v_workspace_name,
      'source', 'principal_claim_invite'
    ),
    coalesce(new.accepted_at, now())
  )
  on conflict (user_id) do update
  set
    onboarding_status = 'onboarding_completed',
    onboarding_step = 'onboarding_complete',
    onboarding_path = excluded.onboarding_path,
    workspace_action = excluded.workspace_action,
    workspace_type = excluded.workspace_type,
    app_role = excluded.app_role,
    intended_org_role = excluded.intended_org_role,
    last_completed_step = excluded.last_completed_step,
    recovery_reason = null,
    onboarding_context_json = coalesce(public.onboarding_states.onboarding_context_json, '{}'::jsonb)
      || excluded.onboarding_context_json,
    completed_at = coalesce(public.onboarding_states.completed_at, excluded.completed_at),
    updated_at = now();

  update public.signup_intents
  set
    workspace_action = 'accept_invite',
    intended_org_role = 'principal',
    role_contract_key = 'agency_owner',
    authority_level = 'owner_management',
    onboarding_path = 'agency_owner',
    invite_token = new.token,
    status = 'consumed',
    consumed_at = coalesce(consumed_at, now()),
    updated_at = now()
  where auth_user_id = v_user_id;

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
    'create_or_join_workspace',
    'principal_claim_invite_accepted',
    jsonb_build_object('invite_id', new.id, 'source', 'principal_claim_invite')
  );

  return new;
end;
$$;

with principal_claim_memberships as (
  select
    ou.id
  from public.organisation_users ou
  where coalesce(ou.scope_metadata->>'source', '') = 'principal_claim_invite'
    and coalesce(ou.module_context, '') = 'commercial'
    and coalesce(ou.module_metadata->>'commercialAccessReason', '') = 'principal_claim'
)
update public.organisation_users ou
set
  module_context = null,
  module_metadata = coalesce(ou.module_metadata, '{}'::jsonb)
    - 'commercialAccessInheritedAt'
    - 'commercialAccessReason'
    - 'commercialRole'
    - 'commercial_role',
  updated_at = now()
from principal_claim_memberships pcm
where ou.id = pcm.id;

commit;
