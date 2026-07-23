begin;

alter table if exists public.signup_intents
  add column if not exists system_role text,
  add column if not exists workspace_kind text,
  add column if not exists role_contract_key text;

alter table if exists public.signup_intents
  drop constraint if exists signup_intents_system_role_check;
alter table if exists public.signup_intents
  add constraint signup_intents_system_role_check
  check (system_role is null or system_role in ('professional', 'client', 'admin', 'super_admin'));

alter table if exists public.signup_intents
  drop constraint if exists signup_intents_workspace_kind_check;
alter table if exists public.signup_intents
  add constraint signup_intents_workspace_kind_check
  check (
    workspace_kind is null
    or workspace_kind in ('agency', 'developer_company', 'attorney_firm', 'bond_originator', 'personal_originator', 'bond_company')
  );

alter table if exists public.organisations
  add column if not exists workspace_kind text;

alter table if exists public.organisations
  drop constraint if exists organisations_workspace_kind_check;
alter table if exists public.organisations
  add constraint organisations_workspace_kind_check
  check (
    workspace_kind is null
    or workspace_kind in ('agency', 'developer_company', 'attorney_firm', 'bond_originator', 'personal_originator', 'bond_company')
  );

alter table if exists public.profiles
  add column if not exists system_role text;

alter table if exists public.organisation_users
  add column if not exists scope_level text,
  add column if not exists region_id uuid references public.workspace_regions(id) on delete set null,
  add column if not exists workspace_unit_id uuid references public.workspace_units(id) on delete set null,
  add column if not exists scope_metadata jsonb,
  add column if not exists active_workspace_selected_at timestamptz;

update public.organisation_users
set scope_metadata = '{}'::jsonb
where scope_metadata is null;

alter table if exists public.organisation_users
  alter column scope_metadata set default '{}'::jsonb,
  alter column scope_metadata set not null;

alter table if exists public.organisation_users
  drop constraint if exists organisation_users_scope_level_check;
alter table if exists public.organisation_users
  add constraint organisation_users_scope_level_check
  check (
    scope_level is null
    or scope_level in ('organisation', 'organization', 'workspace_hq', 'region', 'branch', 'team', 'user', 'assigned', 'independent')
  );

create index if not exists organisation_users_active_workspace_selected_idx
  on public.organisation_users (organisation_id, active_workspace_selected_at desc)
  where active_workspace_selected_at is not null;

create index if not exists signup_intents_role_contract_idx
  on public.signup_intents (role_contract_key)
  where role_contract_key is not null;

do $$
begin
  if to_regprocedure('public.bridge_complete_workspace_onboarding_legacy_20260524(jsonb)') is null
     and to_regprocedure('public.bridge_complete_workspace_onboarding(jsonb)') is not null then
    alter function public.bridge_complete_workspace_onboarding(jsonb)
      rename to bridge_complete_workspace_onboarding_legacy_20260524;
  end if;
end;
$$;

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
  if v_branch_scope not in ('own', 'assigned_branch', 'all_branches') then
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

do $$
begin
  if to_regprocedure('public.bridge_repair_workspace_onboarding_legacy_20260524(uuid)') is null
     and to_regprocedure('public.bridge_repair_workspace_onboarding(uuid)') is not null then
    alter function public.bridge_repair_workspace_onboarding(uuid)
      rename to bridge_repair_workspace_onboarding_legacy_20260524;
  end if;
end;
$$;

create or replace function public.bridge_repair_workspace_onboarding(target_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_actor_id uuid := auth.uid();
  v_user_id uuid := coalesce(target_user_id, auth.uid());
  v_profile public.profiles%rowtype;
  v_membership public.organisation_users%rowtype;
  v_workspace public.organisations%rowtype;
  v_workspace_type text;
  v_workspace_kind text;
  v_workspace_role text;
  v_scope_level text;
  v_branch_scope text;
  v_system_role text;
  v_now timestamptz := now();
begin
  v_result := public.bridge_repair_workspace_onboarding_legacy_20260524(target_user_id);
  if coalesce((v_result->>'success')::boolean, false) is not true then
    return v_result;
  end if;

  if v_actor_id is null or v_actor_id <> v_user_id then
    return v_result;
  end if;

  select * into v_profile from public.profiles where id = v_user_id;

  select * into v_membership
  from public.organisation_users
  where user_id = v_user_id
    and status = 'active'
  order by is_primary_owner desc, active_workspace_selected_at desc nulls last, updated_at desc nulls last, created_at desc
  limit 1;

  if not found then
    return v_result;
  end if;

  select * into v_workspace
  from public.organisations
  where id = v_membership.organisation_id;

  if not found then
    return v_result;
  end if;

  v_workspace_type := coalesce(v_workspace.type, v_membership.workspace_type);
  v_workspace_kind := case
    when v_workspace_type = 'bond_originator' and v_workspace.workspace_kind in ('personal_originator', 'bond_company') then v_workspace.workspace_kind
    when v_workspace_type = 'bond_originator' then 'bond_company'
    when v_workspace_type in ('agency', 'developer_company', 'attorney_firm') then v_workspace_type
    else v_workspace.workspace_kind
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

  update public.organisations
  set
    workspace_kind = v_workspace_kind,
    settings_json = coalesce(settings_json, '{}'::jsonb)
      || jsonb_build_object('workspaceType', v_workspace_type, 'workspaceKind', v_workspace_kind, 'repairRoleContractAppliedAt', v_now),
    updated_at = v_now
  where id = v_workspace.id;

  update public.organisation_users
  set
    workspace_role = v_workspace_role,
    organisation_role = coalesce(organisation_role, v_workspace_role),
    role = coalesce(role, v_workspace_role),
    app_role = coalesce(app_role, v_profile.role),
    workspace_type = v_workspace_type,
    branch_scope = v_branch_scope,
    scope_level = v_scope_level,
    scope_metadata = coalesce(scope_metadata, '{}'::jsonb)
      || jsonb_build_object('workspaceKind', v_workspace_kind, 'repairSource', 'bridge_repair_workspace_onboarding_phase2'),
    active_workspace_selected_at = coalesce(active_workspace_selected_at, v_now),
    updated_at = v_now
  where id = v_membership.id;

  update public.profiles
  set
    system_role = coalesce(system_role, v_system_role),
    onboarding_completed = true,
    updated_at = v_now
  where id = v_user_id;

  return v_result
    || jsonb_build_object(
      'workspace_kind', v_workspace_kind,
      'workspace_role', v_workspace_role,
      'scope_level', v_scope_level,
      'branch_scope', v_branch_scope,
      'system_role', v_system_role
    );
end;
$$;

grant execute on function public.bridge_repair_workspace_onboarding(uuid) to authenticated;

commit;
