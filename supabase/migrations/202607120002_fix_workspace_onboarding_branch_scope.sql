begin;

create or replace function public.bridge_complete_workspace_onboarding(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(payload, '{}'::jsonb);
  v_owner jsonb := coalesce(v_payload->'owner', '{}'::jsonb);
  v_settings jsonb := coalesce(v_payload->'settings', '{}'::jsonb);
  v_contract jsonb := coalesce(v_payload->'role_contract', v_payload #> '{settings,roleContract}', '{}'::jsonb);
  v_legacy_payload jsonb;
  v_legacy_result jsonb;
  v_result jsonb;
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_membership_id uuid;
  v_signup_intent_id uuid := nullif(v_payload->>'signup_intent_id', '')::uuid;
  v_workspace_type text := lower(nullif(trim(coalesce(v_contract->>'workspace_type', v_payload->>'workspace_type', v_payload->>'workspace_kind', '')), ''));
  v_workspace_kind_input text := lower(nullif(trim(coalesce(v_contract->>'workspace_kind', v_payload->>'workspace_kind', v_payload #>> '{settings,workspaceKind}', v_workspace_type, '')), ''));
  v_workspace_kind text;
  v_profile_role text;
  v_system_role text;
  v_workspace_role text;
  v_organisation_role text;
  v_membership_role text;
  v_scope_level text;
  v_branch_scope text;
  v_scope_metadata jsonb;
  v_is_primary_owner boolean;
  v_region_id_text text := nullif(trim(coalesce(v_contract->>'region_id', v_contract->>'regionId', v_owner->>'region_id', v_owner->>'regionId', '')), '');
  v_workspace_unit_id_text text := nullif(trim(coalesce(v_contract->>'workspace_unit_id', v_contract->>'workspaceUnitId', v_owner->>'workspace_unit_id', v_owner->>'workspaceUnitId', '')), '');
  v_now timestamptz := now();
begin
  if v_workspace_type in ('developer') then
    v_workspace_type := 'developer_company';
  elsif v_workspace_type in ('bond', 'bond_company', 'personal_originator') then
    v_workspace_type := 'bond_originator';
  elsif v_workspace_type in ('attorney') then
    v_workspace_type := 'attorney_firm';
  end if;

  if v_workspace_type is null and v_workspace_kind_input in ('bond', 'bond_originator', 'bond_company', 'personal', 'personal_originator') then
    v_workspace_type := 'bond_originator';
  end if;

  v_workspace_kind := case
    when v_workspace_type = 'bond_originator' and v_workspace_kind_input in ('personal', 'personal_originator', 'independent', 'independent_originator', 'solo') then 'personal_originator'
    when v_workspace_type = 'bond_originator' then 'bond_company'
    when v_workspace_type = 'developer_company' then 'developer_company'
    when v_workspace_type = 'attorney_firm' then 'attorney_firm'
    when v_workspace_type = 'agency' then 'agency'
    else v_workspace_kind_input
  end;

  v_profile_role := lower(nullif(trim(coalesce(v_contract->>'profile_role', v_contract->>'profileRole', v_payload->>'app_role', '')), ''));
  v_profile_role := case
    when v_profile_role in ('agent', 'developer', 'attorney', 'bond_originator', 'client', 'platform_admin') then v_profile_role
    when v_workspace_type = 'agency' then 'agent'
    when v_workspace_type = 'developer_company' then 'developer'
    when v_workspace_type = 'attorney_firm' then 'attorney'
    when v_workspace_type = 'bond_originator' then 'bond_originator'
    else v_profile_role
  end;

  v_system_role := lower(nullif(trim(coalesce(v_contract->>'system_role', v_contract->>'systemRole', v_owner->>'system_role', '')), ''));
  v_system_role := case
    when v_system_role in ('professional', 'client', 'admin', 'super_admin') then v_system_role
    when v_profile_role = 'client' then 'client'
    when v_profile_role = 'platform_admin' then 'admin'
    else 'professional'
  end;

  v_workspace_role := lower(nullif(trim(coalesce(v_contract->>'workspace_role', v_contract->>'workspaceRole', v_owner->>'workspace_role', v_owner->>'organisation_role', '')), ''));
  if v_workspace_role = 'super_admin' then
    v_workspace_role := case when v_workspace_type = 'agency' then 'principal' else 'owner' end;
  end if;
  if v_workspace_role is null then
    v_workspace_role := case when v_workspace_type = 'agency' then 'principal' else 'owner' end;
  end if;
  if v_workspace_role not in ('owner', 'principal', 'director', 'partner', 'admin', 'branch_manager', 'manager', 'sales_manager', 'development_manager', 'developer', 'sales_agent', 'agent', 'attorney', 'conveyancer', 'consultant', 'processor', 'bond_originator', 'admin_staff', 'paralegal', 'viewer', 'hq_manager', 'regional_manager', 'team_lead', 'compliance') then
    v_workspace_role := case when v_workspace_type = 'agency' then 'principal' else 'owner' end;
  end if;

  v_organisation_role := lower(nullif(trim(coalesce(v_contract->>'organisation_role', v_contract->>'organisationRole', v_owner->>'organisation_role', v_workspace_role)), ''));
  if v_organisation_role not in ('owner', 'principal', 'director', 'partner', 'admin', 'branch_manager', 'manager', 'sales_manager', 'development_manager', 'developer', 'sales_agent', 'agent', 'attorney', 'conveyancer', 'consultant', 'processor', 'bond_originator', 'admin_staff', 'paralegal', 'viewer', 'hq_manager', 'regional_manager', 'team_lead', 'compliance') then
    v_organisation_role := v_workspace_role;
  end if;

  v_membership_role := lower(nullif(trim(coalesce(v_contract->>'membership_role', v_contract->>'membershipRole', v_owner->>'membership_role', v_organisation_role)), ''));
  if v_membership_role not in ('owner', 'principal', 'director', 'partner', 'admin', 'branch_manager', 'manager', 'sales_manager', 'development_manager', 'developer', 'sales_agent', 'agent', 'attorney', 'conveyancer', 'consultant', 'processor', 'bond_originator', 'admin_staff', 'paralegal', 'viewer', 'hq_manager', 'regional_manager', 'team_lead', 'compliance') then
    v_membership_role := v_organisation_role;
  end if;

  v_scope_level := lower(nullif(trim(coalesce(v_contract->>'scope_level', v_contract->>'scopeLevel', v_owner->>'scope_level', '')), ''));
  if v_workspace_type = 'bond_originator' then
    v_scope_level := case
      when v_scope_level in ('organisation', 'organization', 'hq', 'all_branches') then 'workspace_hq'
      when v_scope_level in ('user', 'independent', 'own', 'assigned_only') then 'assigned'
      when v_scope_level in ('workspace_hq', 'region', 'branch', 'team', 'assigned') then v_scope_level
      when v_workspace_role in ('owner', 'director', 'hq_manager', 'compliance') then 'workspace_hq'
      when v_workspace_role = 'regional_manager' then 'region'
      when v_workspace_role = 'branch_manager' then 'branch'
      when v_workspace_role = 'team_lead' then 'team'
      else 'assigned'
    end;
  else
    v_scope_level := null;
  end if;

  v_branch_scope := lower(nullif(trim(coalesce(v_contract->>'branch_scope', v_contract->>'branchScope', v_owner->>'branch_scope', '')), ''));
  if v_branch_scope is null or v_branch_scope not in ('own', 'assigned_branch', 'all_branches') then
    v_branch_scope := case
      when v_workspace_role in ('owner', 'principal', 'director', 'partner', 'hq_manager', 'regional_manager', 'team_lead') then 'all_branches'
      when v_workspace_role in ('branch_manager', 'manager', 'admin_staff', 'processor', 'paralegal', 'consultant') then 'assigned_branch'
      else 'own'
    end;
  end if;

  v_is_primary_owner := coalesce(
    nullif(v_contract->>'is_primary_owner', '')::boolean,
    nullif(v_contract->>'isPrimaryOwner', '')::boolean,
    nullif(v_owner->>'is_primary_owner', '')::boolean,
    v_workspace_role in ('owner', 'principal', 'director', 'partner')
  );

  v_scope_metadata :=
    coalesce(v_contract->'scope_metadata', v_contract->'scopeMetadata', '{}'::jsonb)
    || coalesce(v_owner->'scope_metadata', v_owner->'scopeMetadata', '{}'::jsonb)
    || jsonb_build_object(
      'roleContractKey', nullif(coalesce(v_contract->>'key', v_payload->>'role_contract_key', ''), ''),
      'workspaceKind', v_workspace_kind,
      'source', 'bridge_complete_workspace_onboarding_phase2'
    );

  v_legacy_payload := v_payload
    || jsonb_build_object(
      'workspace_type', v_workspace_type,
      'workspace_kind', case when v_workspace_type = 'bond_originator' then 'bond_originator' else v_workspace_kind end,
      'app_role', v_profile_role,
      'owner', v_owner || jsonb_build_object(
        'workspace_role', v_workspace_role,
        'organisation_role', v_organisation_role
      ),
      'settings', v_settings || jsonb_build_object(
        'workspaceType', v_workspace_type,
        'workspaceKind', case when v_workspace_type = 'bond_originator' then 'bond_originator' else v_workspace_kind end,
        'roleContract', v_contract
      )
    );

  v_legacy_result := public.bridge_complete_workspace_onboarding_legacy_20260524(v_legacy_payload);

  if coalesce((v_legacy_result->>'success')::boolean, false) is not true then
    return v_legacy_result;
  end if;

  v_workspace_id := nullif(coalesce(v_legacy_result->>'workspace_id', v_legacy_result->>'organisation_id', ''), '')::uuid;
  v_membership_id := nullif(coalesce(v_legacy_result->>'membership_id', ''), '')::uuid;

  if v_workspace_id is null then
    return v_legacy_result;
  end if;

  update public.organisations
  set
    workspace_kind = v_workspace_kind,
    settings_json = coalesce(settings_json, '{}'::jsonb)
      || jsonb_build_object(
        'workspaceType', v_workspace_type,
        'workspaceKind', v_workspace_kind,
        'roleContract', v_contract,
        'onboardingRoleContractAppliedAt', v_now
      ),
    updated_at = v_now
  where id = v_workspace_id;

  update public.organisation_settings
  set
    settings_json = coalesce(settings_json, '{}'::jsonb)
      || jsonb_build_object(
        'workspaceType', v_workspace_type,
        'workspaceKind', v_workspace_kind,
        'roleContract', v_contract,
        'onboardingRoleContractAppliedAt', v_now
      ),
    updated_at = v_now
  where organisation_id = v_workspace_id;

  update public.organisation_users
  set
    role = v_membership_role,
    workspace_role = v_workspace_role,
    organisation_role = v_organisation_role,
    app_role = v_profile_role,
    workspace_type = v_workspace_type,
    branch_scope = v_branch_scope,
    scope_level = v_scope_level,
    region_id = case
      when v_region_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_region_id_text::uuid
      else region_id
    end,
    workspace_unit_id = case
      when v_workspace_unit_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_workspace_unit_id_text::uuid
      else workspace_unit_id
    end,
    scope_metadata = coalesce(scope_metadata, '{}'::jsonb) || v_scope_metadata,
    active_workspace_selected_at = v_now,
    is_primary_owner = v_is_primary_owner,
    updated_at = v_now
  where
    (v_membership_id is not null and id = v_membership_id)
    or (organisation_id = v_workspace_id and user_id = v_user_id);

  update public.profiles
  set
    role = v_profile_role,
    system_role = v_system_role,
    onboarding_completed = true,
    updated_at = v_now
  where id = v_user_id;

  if v_signup_intent_id is not null then
    update public.signup_intents
    set
      system_role = v_system_role,
      workspace_kind = v_workspace_kind,
      role_contract_key = nullif(coalesce(v_contract->>'key', v_payload->>'role_contract_key', role_contract_key, ''), ''),
      updated_at = v_now
    where id = v_signup_intent_id
      and auth_user_id = v_user_id;
  end if;

  update public.onboarding_states
  set
    onboarding_context_json = coalesce(onboarding_context_json, '{}'::jsonb)
      || jsonb_build_object(
        'roleContract', v_contract,
        'workspaceKind', v_workspace_kind,
        'scopeLevel', v_scope_level,
        'branchScope', v_branch_scope
      ),
    updated_at = v_now
  where user_id = v_user_id;

  v_result := v_legacy_result
    || jsonb_build_object(
      'workspace_kind', v_workspace_kind,
      'workspace_role', v_workspace_role,
      'organisation_role', v_organisation_role,
      'membership_role', v_membership_role,
      'profile_role', v_profile_role,
      'system_role', v_system_role,
      'scope_level', v_scope_level,
      'branch_scope', v_branch_scope,
      'role_contract', v_contract,
      'organisation', coalesce(v_legacy_result->'organisation', '{}'::jsonb)
        || jsonb_build_object('workspace_kind', v_workspace_kind)
    );

  update public.workspace_onboarding_completions
  set
    result = v_result,
    updated_at = v_now
  where user_id = v_user_id
    and workspace_id = v_workspace_id
    and status = 'completed';

  return v_result;
end;
$$;

grant execute on function public.bridge_complete_workspace_onboarding(jsonb) to authenticated;

commit;
