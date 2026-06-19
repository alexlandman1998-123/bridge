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
  v_onboarding_state public.onboarding_states%rowtype;
  v_signup_intent public.signup_intents%rowtype;
  v_previous_workspace_id uuid;
  v_previous_branch_id uuid;
  v_branch_id uuid;
  v_email text;
  v_org_name text;
  v_org_slug text;
  v_org_phone text;
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
    select * into v_onboarding_state
    from public.onboarding_states
    where user_id = v_user_id;

    select * into v_signup_intent
    from public.signup_intents
    where auth_user_id = v_user_id;

    if coalesce(v_profile.onboarding_completed, false) is not true
       or coalesce(v_onboarding_state.onboarding_status, '') <> 'onboarding_completed' then
      return jsonb_build_object('success', false, 'code', 'no_active_membership', 'message', 'No active workspace membership could be repaired.', 'details', jsonb_build_object('email', v_email));
    end if;

    if coalesce(v_onboarding_state.onboarding_context_json->>'workspaceId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_previous_workspace_id := (v_onboarding_state.onboarding_context_json->>'workspaceId')::uuid;
    end if;
    if coalesce(v_onboarding_state.onboarding_context_json->>'branchId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_previous_branch_id := (v_onboarding_state.onboarding_context_json->>'branchId')::uuid;
    end if;

    v_workspace_type := coalesce(
      nullif(v_onboarding_state.workspace_type, ''),
      nullif(v_signup_intent.workspace_type, ''),
      case
        when v_profile.role = 'developer' then 'developer_company'
        when v_profile.role = 'attorney' then 'attorney_firm'
        when v_profile.role = 'bond_originator' then 'bond_originator'
        else 'agency'
      end
    );
    v_workspace_kind := case
      when v_workspace_type = 'bond_originator' and v_signup_intent.workspace_kind in ('personal_originator', 'bond_company') then v_signup_intent.workspace_kind
      when v_workspace_type = 'bond_originator' then 'bond_company'
      when v_workspace_type in ('agency', 'developer_company', 'attorney_firm') then v_workspace_type
      else v_workspace_type
    end;
    v_workspace_role := coalesce(
      nullif(v_onboarding_state.intended_org_role, ''),
      nullif(v_signup_intent.intended_org_role, ''),
      case when v_workspace_type = 'agency' then 'principal' else 'owner' end
    );
    if v_workspace_role not in ('owner', 'principal', 'director', 'partner', 'admin', 'branch_manager', 'manager', 'sales_manager', 'development_manager', 'developer', 'sales_agent', 'agent', 'attorney', 'conveyancer', 'consultant', 'processor', 'bond_originator', 'admin_staff', 'paralegal', 'viewer', 'hq_manager', 'regional_manager', 'team_lead', 'compliance') then
      v_workspace_role := case when v_workspace_type = 'agency' then 'principal' else 'owner' end;
    end if;
    v_branch_scope := case
      when v_workspace_role in ('owner', 'principal', 'director', 'partner', 'hq_manager', 'regional_manager', 'team_lead') then 'all_branches'
      when v_workspace_role in ('branch_manager', 'manager', 'admin_staff', 'processor', 'paralegal', 'consultant') then 'assigned_branch'
      else 'own'
    end;
    v_scope_level := case
      when v_workspace_type <> 'bond_originator' then null
      when v_workspace_role in ('owner', 'director', 'hq_manager', 'compliance') then 'workspace_hq'
      when v_workspace_role = 'regional_manager' then 'region'
      when v_workspace_role = 'branch_manager' then 'branch'
      when v_workspace_role = 'team_lead' then 'team'
      else 'assigned'
    end;
    v_system_role := case
      when coalesce(v_profile.role, v_signup_intent.app_role) = 'client' then 'client'
      when coalesce(v_profile.role, v_signup_intent.app_role) = 'platform_admin' then 'admin'
      else 'professional'
    end;
    v_org_name := nullif(trim(coalesce(v_profile.company_name, v_profile.full_name, v_email)), '');
    v_org_phone := nullif(trim(coalesce(v_profile.phone_number, '')), '');
    v_org_slug := trim(both '-' from regexp_replace(lower(coalesce(v_org_name, 'workspace')), '[^a-z0-9]+', '-', 'g'));
    if v_org_slug is null or v_org_slug = '' then
      v_org_slug := 'recovered-workspace';
    end if;

    insert into public.organisations (
      id,
      name,
      display_name,
      type,
      workspace_kind,
      legal_name,
      company_email,
      company_phone,
      support_email,
      support_phone,
      primary_contact_person,
      status,
      created_by,
      settings_json
    )
    values (
      coalesce(v_previous_workspace_id, gen_random_uuid()),
      v_org_name,
      v_org_name,
      v_workspace_type,
      v_workspace_kind,
      v_org_name,
      v_email,
      v_org_phone,
      v_email,
      v_org_phone,
      nullif(trim(coalesce(v_profile.full_name, v_email)), ''),
      'active',
      v_user_id,
      jsonb_build_object(
        'workspaceType', v_workspace_type,
        'workspaceKind', v_workspace_kind,
        'onboardingSource', 'bridge_repair_workspace_onboarding_recreate_missing_workspace',
        'recreatedFromOnboardingState', true,
        'previousWorkspaceId', coalesce(v_previous_workspace_id::text, v_onboarding_state.onboarding_context_json->>'workspaceId'),
        'previousMembershipId', v_onboarding_state.onboarding_context_json->>'membershipId'
      )
    )
    on conflict (id) do update set
      name = excluded.name,
      display_name = excluded.display_name,
      type = excluded.type,
      workspace_kind = excluded.workspace_kind,
      legal_name = excluded.legal_name,
      company_email = excluded.company_email,
      company_phone = excluded.company_phone,
      support_email = excluded.support_email,
      support_phone = excluded.support_phone,
      primary_contact_person = excluded.primary_contact_person,
      status = 'active',
      is_demo_data = false,
      settings_json = coalesce(public.organisations.settings_json, '{}'::jsonb) || excluded.settings_json,
      updated_at = v_now
    returning * into v_workspace;

    if v_workspace_type in ('agency', 'attorney_firm', 'bond_originator') then
      insert into public.organisation_branches (
        id,
        organisation_id,
        name,
        slug,
        principal_user_id,
        phone,
        email,
        is_head_office,
        is_default,
        is_active,
        status,
        metadata_json,
        created_by
      )
      values (
        coalesce(v_previous_branch_id, gen_random_uuid()),
        v_workspace.id,
        'Head Office',
        v_org_slug || '-head-office',
        v_user_id,
        v_org_phone,
        v_email,
        true,
        true,
        true,
        'active',
        jsonb_build_object('source', 'bridge_repair_workspace_onboarding_recreate_missing_workspace'),
        v_user_id
      )
      on conflict (id) do update set
        organisation_id = excluded.organisation_id,
        principal_user_id = excluded.principal_user_id,
        phone = coalesce(public.organisation_branches.phone, excluded.phone),
        email = coalesce(public.organisation_branches.email, excluded.email),
        is_head_office = true,
        is_default = true,
        is_active = true,
        status = 'active',
        is_demo_data = false,
        metadata_json = coalesce(public.organisation_branches.metadata_json, '{}'::jsonb) || excluded.metadata_json,
        updated_at = v_now
      returning id into v_branch_id;
    end if;

    insert into public.organisation_users (
      organisation_id,
      user_id,
      branch_id,
      primary_branch_id,
      branch_scope,
      first_name,
      last_name,
      email,
      role,
      workspace_role,
      organisation_role,
      organization_role,
      app_role,
      workspace_type,
      status,
      membership_status,
      permissions_json,
      scope_level,
      scope_metadata,
      invited_by_user_id,
      invited_at,
      joined_at,
      accepted_at,
      last_active_at,
      active_workspace_selected_at,
      is_primary_owner,
      created_by
    )
    values (
      v_workspace.id,
      v_user_id,
      v_branch_id,
      v_branch_id,
      v_branch_scope,
      nullif(trim(coalesce(v_profile.first_name, '')), ''),
      nullif(trim(coalesce(v_profile.last_name, '')), ''),
      v_email,
      v_workspace_role,
      v_workspace_role,
      v_workspace_role,
      v_workspace_role,
      coalesce(v_profile.role, v_signup_intent.app_role),
      v_workspace_type,
      'active',
      'active',
      '{}'::jsonb,
      v_scope_level,
      jsonb_build_object(
        'workspaceKind', v_workspace_kind,
        'repairSource', 'bridge_repair_workspace_onboarding_recreate_missing_workspace'
      ),
      v_user_id,
      v_now,
      v_now,
      v_now,
      v_now,
      v_now,
      v_workspace_role in ('owner', 'principal', 'director', 'partner'),
      v_user_id
    )
    returning * into v_membership;
  end if;

  if v_workspace.id is null then
    select * into v_workspace
    from public.organisations
    where id = v_membership.organisation_id;
  end if;

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
