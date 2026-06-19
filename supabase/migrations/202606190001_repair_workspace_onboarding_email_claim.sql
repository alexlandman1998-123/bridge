begin;

create or replace function public.bridge_repair_workspace_onboarding(target_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_user_id uuid := coalesce(target_user_id, auth.uid());
  v_profile public.profiles%rowtype;
  v_membership public.organisation_users%rowtype;
  v_workspace public.organisations%rowtype;
  v_branch_id uuid;
  v_email text;
  v_workspace_type text;
  v_workspace_kind text;
  v_workspace_role text;
  v_scope_level text;
  v_branch_scope text;
  v_system_role text;
  v_now timestamptz := now();
begin
  if v_actor_id is null or v_actor_id <> v_user_id then
    return jsonb_build_object('success', false, 'code', 'permission_denied', 'message', 'You can only repair your own onboarding state.', 'details', '{}'::jsonb);
  end if;

  select * into v_profile
  from public.profiles
  where id = v_user_id;

  if not found then
    return jsonb_build_object('success', false, 'code', 'missing_profile', 'message', 'Profile is missing.', 'details', jsonb_build_object('user_id', v_user_id));
  end if;

  v_email := nullif(lower(trim(coalesce(v_profile.email, ''))), '');
  if v_email is null then
    return jsonb_build_object('success', false, 'code', 'missing_profile_email', 'message', 'A verified profile email is required before workspace membership can be repaired.', 'details', jsonb_build_object('user_id', v_user_id));
  end if;

  select * into v_membership
  from public.organisation_users
  where status = 'active'
    and (
      user_id = v_user_id
      or (
        user_id is null
        and lower(coalesce(email, '')) = v_email
      )
    )
  order by
    case when user_id = v_user_id then 0 else 1 end,
    is_primary_owner desc,
    active_workspace_selected_at desc nulls last,
    updated_at desc nulls last,
    created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'code', 'no_active_membership', 'message', 'No active workspace membership could be repaired.', 'details', jsonb_build_object('email', v_email));
  end if;

  select * into v_workspace
  from public.organisations
  where id = v_membership.organisation_id;

  if not found then
    return jsonb_build_object('success', false, 'code', 'workspace_missing', 'message', 'The active membership points to a missing workspace.', 'details', jsonb_build_object('organisation_id', v_membership.organisation_id));
  end if;

  v_workspace_type := coalesce(v_workspace.type, v_membership.workspace_type);
  v_workspace_kind := case
    when v_workspace_type = 'bond_originator' and v_workspace.workspace_kind in ('personal_originator', 'bond_company') then v_workspace.workspace_kind
    when v_workspace_type = 'bond_originator' then 'bond_company'
    when v_workspace_type in ('agency', 'developer_company', 'attorney_firm') then v_workspace_type
    else coalesce(v_workspace.workspace_kind, v_workspace_type)
  end;

  v_workspace_role := coalesce(v_membership.workspace_role, v_membership.organisation_role, v_membership.role);
  v_scope_level := case
    when v_workspace_type <> 'bond_originator' then null
    when v_membership.scope_level in ('organisation', 'organization', 'hq', 'all_branches') then 'workspace_hq'
    when v_membership.scope_level in ('user', 'independent', 'own', 'assigned_only') then 'assigned'
    when v_membership.scope_level in ('workspace_hq', 'region', 'branch', 'team', 'assigned') then v_membership.scope_level
    when v_workspace_role in ('owner', 'director', 'hq_manager', 'compliance') then 'workspace_hq'
    when v_workspace_role = 'regional_manager' then 'region'
    when v_workspace_role = 'branch_manager' then 'branch'
    when v_workspace_role = 'team_lead' then 'team'
    else 'assigned'
  end;
  v_branch_scope := case
    when v_membership.branch_scope in ('own', 'assigned_branch', 'all_branches') then v_membership.branch_scope
    when v_workspace_role in ('owner', 'principal', 'director', 'partner', 'hq_manager', 'regional_manager', 'team_lead') then 'all_branches'
    when v_workspace_role in ('branch_manager', 'manager', 'admin_staff', 'processor', 'paralegal', 'consultant') then 'assigned_branch'
    else 'own'
  end;
  v_system_role := case
    when coalesce(v_profile.role, v_membership.app_role) = 'client' then 'client'
    when coalesce(v_profile.role, v_membership.app_role) = 'platform_admin' then 'admin'
    else 'professional'
  end;

  if v_workspace_type in ('agency', 'attorney_firm', 'bond_originator') then
    select id into v_branch_id
    from public.organisation_branches
    where organisation_id = v_workspace.id
      and is_active = true
    order by is_default desc, is_head_office desc, created_at asc
    limit 1;

    if v_branch_id is null then
      insert into public.organisation_branches (
        organisation_id,
        name,
        slug,
        principal_user_id,
        is_head_office,
        is_default,
        is_active,
        status,
        metadata_json,
        created_by
      )
      values (
        v_workspace.id,
        'Head Office',
        'head-office',
        v_user_id,
        true,
        true,
        true,
        'active',
        jsonb_build_object('source', 'bridge_repair_workspace_onboarding_email_claim'),
        v_user_id
      )
      returning id into v_branch_id;
    end if;
  end if;

  update public.organisations
  set
    workspace_kind = coalesce(v_workspace_kind, workspace_kind),
    settings_json = coalesce(settings_json, '{}'::jsonb)
      || jsonb_build_object('workspaceType', v_workspace_type, 'workspaceKind', v_workspace_kind, 'repairRoleContractAppliedAt', v_now),
    updated_at = v_now
  where id = v_workspace.id;

  update public.organisation_users
  set
    user_id = coalesce(user_id, v_user_id),
    branch_id = coalesce(branch_id, v_branch_id),
    primary_branch_id = coalesce(primary_branch_id, branch_id, v_branch_id),
    branch_scope = v_branch_scope,
    workspace_role = v_workspace_role,
    organisation_role = coalesce(organisation_role, v_workspace_role),
    role = coalesce(role, v_workspace_role),
    app_role = coalesce(app_role, v_profile.role),
    workspace_type = v_workspace_type,
    scope_level = v_scope_level,
    scope_metadata = coalesce(scope_metadata, '{}'::jsonb)
      || jsonb_build_object('workspaceKind', v_workspace_kind, 'repairSource', 'bridge_repair_workspace_onboarding_email_claim'),
    active_workspace_selected_at = coalesce(active_workspace_selected_at, v_now),
    accepted_at = coalesce(accepted_at, v_now),
    joined_at = coalesce(joined_at, v_now),
    updated_at = v_now
  where id = v_membership.id;

  insert into public.organisation_settings (organisation_id, settings_json)
  values (
    v_workspace.id,
    jsonb_build_object(
      'workspaceType', v_workspace_type,
      'workspaceKind', v_workspace_kind,
      'repairedAt', v_now,
      'repairSource', 'bridge_repair_workspace_onboarding_email_claim'
    )
  )
  on conflict (organisation_id)
  do update set
    settings_json = coalesce(public.organisation_settings.settings_json, '{}'::jsonb)
      || jsonb_build_object('workspaceType', v_workspace_type, 'workspaceKind', v_workspace_kind, 'repairedAt', v_now, 'repairSource', 'bridge_repair_workspace_onboarding_email_claim'),
    updated_at = v_now;

  insert into public.user_workspace_preferences (
    user_id,
    active_workspace_id,
    active_workspace_source
  )
  values (
    v_user_id,
    v_workspace.id,
    'system_recovery'
  )
  on conflict (user_id)
  do update set
    active_workspace_id = excluded.active_workspace_id,
    active_workspace_source = excluded.active_workspace_source,
    updated_at = v_now;

  insert into public.onboarding_states (
    user_id,
    onboarding_status,
    onboarding_step,
    workspace_action,
    workspace_type,
    app_role,
    intended_org_role,
    last_completed_step,
    onboarding_context_json,
    recovery_reason,
    completed_at
  )
  values (
    v_user_id,
    'onboarding_completed',
    'onboarding_complete',
    'create_workspace',
    v_workspace_type,
    coalesce(v_profile.role, v_membership.app_role),
    v_workspace_role,
    'onboarding_review',
    jsonb_build_object('source', 'bridge_repair_workspace_onboarding_email_claim', 'workspaceId', v_workspace.id, 'membershipId', v_membership.id, 'branchId', v_branch_id),
    null,
    v_now
  )
  on conflict (user_id)
  do update set
    onboarding_status = excluded.onboarding_status,
    onboarding_step = excluded.onboarding_step,
    workspace_action = excluded.workspace_action,
    workspace_type = excluded.workspace_type,
    app_role = excluded.app_role,
    intended_org_role = excluded.intended_org_role,
    last_completed_step = excluded.last_completed_step,
    onboarding_context_json = excluded.onboarding_context_json,
    recovery_reason = null,
    completed_at = excluded.completed_at,
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
    v_workspace.id,
    'onboarding_complete',
    'workspace_onboarding_repaired',
    jsonb_build_object('source', 'bridge_repair_workspace_onboarding_email_claim', 'membershipId', v_membership.id, 'branchId', v_branch_id, 'claimedByEmail', v_membership.user_id is null)
  );

  update public.profiles
  set
    system_role = coalesce(system_role, v_system_role),
    onboarding_completed = true,
    updated_at = v_now
  where id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'workspace_id', v_workspace.id,
    'organisation_id', v_workspace.id,
    'membership_id', v_membership.id,
    'branch_id', v_branch_id,
    'workspace_kind', v_workspace_kind,
    'workspace_role', v_workspace_role,
    'scope_level', v_scope_level,
    'branch_scope', v_branch_scope,
    'system_role', v_system_role,
    'claimed_by_email', v_membership.user_id is null,
    'repaired', true
  );
exception
  when others then
    return jsonb_build_object(
      'success', false,
      'code', 'repair_failed',
      'message', SQLERRM,
      'details', jsonb_build_object('sqlstate', SQLSTATE)
    );
end;
$$;

grant execute on function public.bridge_repair_workspace_onboarding(uuid) to authenticated;

commit;
