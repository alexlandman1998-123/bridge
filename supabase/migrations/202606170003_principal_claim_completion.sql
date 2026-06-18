begin;

alter table if exists public.user_workspace_preferences
  drop constraint if exists user_workspace_preferences_source_check;

alter table if exists public.user_workspace_preferences
  add constraint user_workspace_preferences_source_check check (
    active_workspace_source in (
      'user_selected',
      'auth_boot',
      'system_recovery',
      'principal_claim_completed'
    )
  );

drop policy if exists organisations_agency_select on public.organisations;
create policy organisations_agency_select
on public.organisations
for select to authenticated
using (
  public.bridge_is_active_member(id)
  or exists (
    select 1
    from public.organisation_users ou
    where ou.organisation_id = organisations.id
      and coalesce(ou.membership_status, ou.status) in ('invited', 'pending')
      and (
        lower(coalesce(ou.email, '')) = public.bridge_current_email()
        or ou.user_id = auth.uid()
      )
  )
);

drop policy if exists organisation_users_agency_select on public.organisation_users;
create policy organisation_users_agency_select
on public.organisation_users
for select to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  or (
    coalesce(membership_status, status) in ('invited', 'pending')
    and (
      lower(coalesce(email, '')) = public.bridge_current_email()
      or user_id = auth.uid()
    )
  )
);

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
      email = coalesce(nullif(email, ''), v_email),
      role = 'principal',
      workspace_role = 'principal',
      organisation_role = 'principal',
      app_role = 'agent',
      workspace_type = v_workspace_type,
      module_context = case when v_commercial_enabled then 'commercial' else module_context end,
      module_metadata = case
        when v_commercial_enabled then coalesce(module_metadata, '{}'::jsonb)
          || jsonb_build_object(
            'source', 'principal_claim_invite',
            'commercialAccessInheritedAt', coalesce(new.accepted_at, now()),
            'commercialAccessReason', 'principal_claim'
          )
        else module_metadata
      end,
      status = 'pending',
      membership_status = 'pending',
      invited_by_user_id = coalesce(invited_by_user_id, new.inviter_user_id),
      invited_at = coalesce(invited_at, new.created_at),
      accepted_at = coalesce(accepted_at, new.accepted_at, now()),
      scope_metadata = coalesce(scope_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'principalClaimInviteId', new.id,
          'principalClaimAcceptedAt', coalesce(new.accepted_at, now()),
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
      app_role,
      workspace_type,
      module_context,
      module_metadata,
      status,
      membership_status,
      invited_by_user_id,
      invited_at,
      accepted_at,
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
      'agent',
      v_workspace_type,
      case when v_commercial_enabled then 'commercial' else null end,
      case
        when v_commercial_enabled then jsonb_build_object(
          'source', 'principal_claim_invite',
          'commercialAccessInheritedAt', coalesce(new.accepted_at, now()),
          'commercialAccessReason', 'principal_claim'
        )
        else '{}'::jsonb
      end,
      'pending',
      'pending',
      new.inviter_user_id,
      new.created_at,
      coalesce(new.accepted_at, now()),
      jsonb_build_object(
        'principalClaimInviteId', new.id,
        'principalClaimAcceptedAt', coalesce(new.accepted_at, now()),
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
    onboarding_completed = false,
    updated_at = now()
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
    onboarding_context_json
  )
  values (
    v_user_id,
    'workspace_pending_approval',
    'configure_workspace',
    'agency_owner',
    'claim_existing_workspace',
    'agency',
    'agent',
    'principal',
    jsonb_build_object(
      'principalClaimInviteId', new.id,
      'targetWorkspaceId', new.target_workspace_id,
      'source', 'principal_claim_invite'
    )
  )
  on conflict (user_id) do update
  set
    onboarding_status = 'workspace_pending_approval',
    onboarding_step = 'configure_workspace',
    onboarding_path = 'agency_owner',
    workspace_action = 'claim_existing_workspace',
    workspace_type = 'agency',
    app_role = 'agent',
    intended_org_role = 'principal',
    onboarding_context_json = coalesce(public.onboarding_states.onboarding_context_json, '{}'::jsonb)
      || excluded.onboarding_context_json,
    updated_at = now();

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
    'configure_workspace',
    'principal_claim_accepted',
    jsonb_build_object('invite_id', new.id, 'source', 'principal_claim_invite')
  );

  return new;
end;
$$;

drop trigger if exists trg_bridge_sync_principal_claim_membership on public.invites;
create trigger trg_bridge_sync_principal_claim_membership
after update of status on public.invites
for each row
execute function public.bridge_sync_principal_claim_membership();

create or replace function public.bridge_complete_principal_claim_onboarding(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(payload, '{}'::jsonb);
  v_user_id uuid := auth.uid();
  v_org_payload jsonb := coalesce(v_payload->'organisation', '{}'::jsonb);
  v_settings jsonb := coalesce(v_payload->'settings', '{}'::jsonb);
  v_branches jsonb := coalesce(v_payload->'branches', '[]'::jsonb);
  v_owner jsonb := coalesce(v_payload->'owner', '{}'::jsonb);
  v_membership public.organisation_users%rowtype;
  v_invite public.invites%rowtype;
  v_workspace_id uuid;
  v_branch jsonb;
  v_branch_id uuid;
  v_branch_name text;
  v_branch_slug text;
  v_commercial_enabled boolean := false;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'not_authenticated', 'message', 'Sign in before completing a principal claim.');
  end if;

  select *
  into v_membership
  from public.organisation_users ou
  where ou.user_id = v_user_id
    and coalesce(ou.membership_status, ou.status) = 'pending'
    and coalesce(ou.workspace_role, ou.organisation_role, ou.role) = 'principal'
    and coalesce(ou.scope_metadata->>'source', '') = 'principal_claim_invite'
  order by ou.accepted_at desc nulls last, ou.created_at desc
  limit 1
  for update;

  if v_membership.id is null then
    return jsonb_build_object('success', false, 'code', 'principal_claim_missing', 'message', 'No pending principal claim was found for this account.');
  end if;

  v_workspace_id := v_membership.organisation_id;

  select exists (
    select 1
    from public.organisation_modules om
    where om.organisation_id = v_workspace_id
      and om.module_key = 'commercial'
      and coalesce(om.status, '') = 'active'
  )
  or exists (
    select 1
    from public.organisation_settings os
    where os.organisation_id = v_workspace_id
      and (
        lower(coalesce(os.settings_json->'enabledModules'->>'commercial', 'false')) = 'true'
        or lower(coalesce(os.settings_json->'commercialWorkspace'->>'status', '')) = 'active'
      )
  )
  into v_commercial_enabled;

  select *
  into v_invite
  from public.invites i
  where i.id = nullif(v_membership.scope_metadata->>'principalClaimInviteId', '')::uuid
    and i.invite_type = 'principal_claim_invite'
    and i.status = 'accepted'
  limit 1;

  if v_invite.id is null then
    return jsonb_build_object('success', false, 'code', 'principal_claim_invite_missing', 'message', 'The accepted principal claim invite could not be verified.');
  end if;

  update public.organisations
  set
    name = coalesce(nullif(v_org_payload->>'name', ''), name),
    display_name = coalesce(nullif(v_org_payload->>'trading_name', ''), nullif(v_org_payload->>'legal_name', ''), nullif(v_org_payload->>'name', ''), display_name, name),
    legal_name = coalesce(nullif(v_org_payload->>'legal_name', ''), legal_name),
    company_email = coalesce(nullif(v_org_payload->>'email', ''), company_email),
    email = coalesce(nullif(v_org_payload->>'email', ''), email),
    support_email = coalesce(nullif(v_org_payload->>'email', ''), support_email),
    company_phone = coalesce(nullif(v_org_payload->>'phone', ''), company_phone),
    phone = coalesce(nullif(v_org_payload->>'phone', ''), phone),
    support_phone = coalesce(nullif(v_org_payload->>'phone', ''), support_phone),
    website = coalesce(nullif(v_org_payload->>'website', ''), website),
    address_line_1 = coalesce(nullif(v_org_payload->>'address', ''), address_line_1),
    province = coalesce(nullif(v_org_payload->>'province', ''), province),
    country = coalesce(nullif(v_org_payload->>'country', ''), country),
    workspace_kind = coalesce(nullif(v_payload->>'workspace_kind', ''), workspace_kind, 'agency'),
    settings_json = coalesce(settings_json, '{}'::jsonb)
      || jsonb_build_object(
        'workspaceType', 'agency',
        'workspaceKind', coalesce(nullif(v_payload->>'workspace_kind', ''), 'agency'),
        'principalClaimCompletedAt', v_now
      ),
    updated_at = v_now
  where id = v_workspace_id;

  insert into public.organisation_settings (
    organisation_id,
    settings_json
  )
  values (
    v_workspace_id,
    v_settings || jsonb_build_object('principalClaimCompletedAt', v_now)
  )
  on conflict (organisation_id) do update
  set
    settings_json = coalesce(public.organisation_settings.settings_json, '{}'::jsonb)
      || excluded.settings_json,
    updated_at = v_now;

  if jsonb_typeof(v_branches) = 'array' then
    for v_branch in select * from jsonb_array_elements(v_branches)
    loop
      v_branch_name := nullif(trim(coalesce(v_branch->>'name', v_branch->>'branchName', '')), '');
      if v_branch_name is not null then
        v_branch_slug := lower(regexp_replace(v_branch_name, '[^a-zA-Z0-9]+', '-', 'g'));
        v_branch_slug := trim(both '-' from v_branch_slug);

        select existing.id
        into v_branch_id
        from public.organisation_branches existing
        where existing.organisation_id = v_workspace_id
          and (
            lower(existing.name) = lower(v_branch_name)
            or (
              nullif(v_branch_slug, '') is not null
              and lower(coalesce(existing.slug, '')) = lower(v_branch_slug)
            )
          )
        order by existing.created_at asc
        limit 1;

        if v_branch_id is not null then
          update public.organisation_branches
          set
            name = v_branch_name,
            address = coalesce(nullif(coalesce(v_branch->>'address', v_branch->>'officeLocation', ''), ''), address),
            location = coalesce(nullif(coalesce(v_branch->>'location', v_branch->>'officeLocation', ''), ''), location),
            manager_name = coalesce(nullif(coalesce(v_branch->>'manager_name', v_branch->>'managerName', ''), ''), manager_name),
            province = coalesce(nullif(coalesce(v_branch->>'province', ''), ''), province),
            email = coalesce(nullif(coalesce(v_branch->>'email', ''), ''), email),
            phone = coalesce(nullif(coalesce(v_branch->>'phone', ''), ''), phone),
            principal_user_id = coalesce(principal_user_id, v_user_id),
            metadata_json = coalesce(metadata_json, '{}'::jsonb)
              || jsonb_build_object('source', 'principal_claim_onboarding'),
            updated_at = v_now
          where id = v_branch_id;
        else
          insert into public.organisation_branches (
            organisation_id,
            name,
            slug,
            address,
            location,
            manager_name,
            province,
            email,
            phone,
            is_head_office,
            is_active,
            agent_count,
            principal_user_id,
            metadata_json
          )
          values (
            v_workspace_id,
            v_branch_name,
            nullif(v_branch_slug, ''),
            nullif(coalesce(v_branch->>'address', v_branch->>'officeLocation', ''), ''),
            nullif(coalesce(v_branch->>'location', v_branch->>'officeLocation', ''), ''),
            nullif(coalesce(v_branch->>'manager_name', v_branch->>'managerName', ''), ''),
            nullif(coalesce(v_branch->>'province', ''), ''),
            nullif(coalesce(v_branch->>'email', ''), ''),
            nullif(coalesce(v_branch->>'phone', ''), ''),
            not exists (select 1 from public.organisation_branches existing where existing.organisation_id = v_workspace_id),
            true,
            case
              when coalesce(v_branch->>'agent_count', '') ~ '^[0-9]+$' then (v_branch->>'agent_count')::integer
              else 0
            end,
            v_user_id,
            jsonb_build_object('source', 'principal_claim_onboarding')
          );
        end if;
      end if;
    end loop;
  end if;

  update public.organisation_users
  set
    role = 'principal',
    workspace_role = 'principal',
    organisation_role = 'principal',
    organization_role = coalesce(organization_role, 'principal'),
    app_role = 'agent',
    workspace_type = 'agency',
    module_context = case when v_commercial_enabled then 'commercial' else module_context end,
    module_metadata = case
      when v_commercial_enabled then coalesce(module_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'source', 'principal_claim_onboarding',
          'commercialAccessInheritedAt', v_now,
          'commercialAccessReason', 'principal_claim_completed'
        )
      else module_metadata
    end,
    status = 'active',
    membership_status = 'active',
    joined_at = coalesce(joined_at, v_now),
    accepted_at = coalesce(accepted_at, v_now),
    active_workspace_selected_at = v_now,
    is_primary_owner = coalesce(is_primary_owner, false),
    scope_metadata = coalesce(scope_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'principalClaimCompletedAt', v_now,
        'principalClaimStatus', 'completed'
      ),
    updated_at = v_now
  where id = v_membership.id
  returning * into v_membership;

  update public.profiles
  set
    first_name = coalesce(nullif(first_name, ''), nullif(v_owner->>'first_name', '')),
    last_name = coalesce(nullif(last_name, ''), nullif(v_owner->>'last_name', '')),
    full_name = coalesce(nullif(full_name, ''), nullif(v_owner->>'full_name', '')),
    phone_number = coalesce(nullif(phone_number, ''), nullif(v_owner->>'phone', '')),
    role = 'agent',
    system_role = 'professional',
    onboarding_completed = true,
    updated_at = v_now
  where id = v_user_id;

  insert into public.user_workspace_preferences (
    user_id,
    active_workspace_id,
    active_workspace_source
  )
  values (
    v_user_id,
    v_workspace_id,
    'principal_claim_completed'
  )
  on conflict (user_id) do update
  set
    active_workspace_id = excluded.active_workspace_id,
    active_workspace_source = excluded.active_workspace_source,
    updated_at = v_now;

  update public.invites
  set
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'principal_claim_completed_at', v_now,
        'principal_claim_membership_id', v_membership.id
      ),
    updated_at = v_now
  where id = v_invite.id;

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
      'principalClaimInviteId', v_invite.id,
      'targetWorkspaceId', v_workspace_id,
      'source', 'principal_claim_onboarding'
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
    completed_at = v_now,
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
    v_workspace_id,
    'onboarding_complete',
    'principal_claim_completed',
    jsonb_build_object('invite_id', v_invite.id, 'membership_id', v_membership.id)
  );

  perform public.bridge_record_invite_event(
    v_invite.id,
    'principal_claim_completed',
    v_user_id,
    jsonb_build_object('membership_id', v_membership.id, 'workspace_id', v_workspace_id)
  );

  return jsonb_build_object(
    'success', true,
    'workspace_id', v_workspace_id,
    'organisation_id', v_workspace_id,
    'membership_id', v_membership.id,
    'invite_id', v_invite.id,
    'workspace_type', 'agency',
    'workspace_role', 'principal',
    'membership_role', 'principal',
    'profile_role', 'agent',
    'commercial_access_inherited', v_commercial_enabled,
    'principal_claim_completed', true
  );
end;
$$;

grant execute on function public.bridge_complete_principal_claim_onboarding(jsonb) to authenticated;

commit;
