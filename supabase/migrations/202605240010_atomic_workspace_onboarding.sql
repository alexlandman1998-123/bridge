begin;

create extension if not exists "pgcrypto";

alter table if exists public.organisations
  add column if not exists type text,
  add column if not exists legal_name text,
  add column if not exists registration_number text,
  add column if not exists billing_email text,
  add column if not exists status text not null default 'active',
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists settings_json jsonb not null default '{}'::jsonb;

alter table if exists public.organisation_branches
  add column if not exists slug text,
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists address text,
  add column if not exists principal_user_id uuid,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists status text not null default 'active',
  add column if not exists is_default boolean not null default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create unique index if not exists organisation_branches_org_slug_unique
  on public.organisation_branches (organisation_id, lower(slug))
  where slug is not null and length(trim(slug)) > 0;

create index if not exists organisation_branches_org_default_idx
  on public.organisation_branches (organisation_id, is_default)
  where is_default = true;

alter table if exists public.organisation_users
  add column if not exists app_role text,
  add column if not exists workspace_type text,
  add column if not exists workspace_role text,
  add column if not exists organisation_role text,
  add column if not exists primary_branch_id uuid references public.organisation_branches(id) on delete set null,
  add column if not exists branch_scope text not null default 'own',
  add column if not exists is_primary_owner boolean not null default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.organisation_users
set workspace_role = coalesce(workspace_role, organisation_role, role)
where workspace_role is null;

update public.organisation_users
set primary_branch_id = coalesce(primary_branch_id, branch_id)
where primary_branch_id is null
  and branch_id is not null;

update public.organisation_users
set branch_scope = case
  when coalesce(workspace_role, organisation_role, role) in ('owner', 'principal', 'director', 'partner') then 'all_branches'
  when coalesce(workspace_role, organisation_role, role) in ('branch_manager', 'manager', 'admin_staff', 'processor', 'paralegal') then 'assigned_branch'
  else 'own'
end
where branch_scope is null or branch_scope not in ('own', 'assigned_branch', 'all_branches');

create table if not exists public.workspace_onboarding_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  signup_intent_id uuid references public.signup_intents(id) on delete set null,
  idempotency_key text not null,
  workspace_id uuid references public.organisations(id) on delete set null,
  status text not null default 'completed',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_onboarding_completions_status_check
    check (status in ('completed', 'failed', 'repaired'))
);

create unique index if not exists workspace_onboarding_completions_user_key_idx
  on public.workspace_onboarding_completions (user_id, idempotency_key);

create index if not exists workspace_onboarding_completions_workspace_idx
  on public.workspace_onboarding_completions (workspace_id);

drop trigger if exists workspace_onboarding_completions_set_updated_at on public.workspace_onboarding_completions;
create trigger workspace_onboarding_completions_set_updated_at
before update on public.workspace_onboarding_completions
for each row
execute function public.bridge_set_updated_at();

alter table public.workspace_onboarding_completions enable row level security;

drop policy if exists workspace_onboarding_completions_select_self on public.workspace_onboarding_completions;
create policy workspace_onboarding_completions_select_self
  on public.workspace_onboarding_completions
  for select
  to authenticated
  using (user_id = auth.uid());

grant select on public.workspace_onboarding_completions to authenticated;

create or replace function public.bridge_complete_workspace_onboarding(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(payload, '{}'::jsonb);
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_signup_intent public.signup_intents%rowtype;
  v_signup_intent_id uuid := nullif(v_payload->>'signup_intent_id', '')::uuid;
  v_workspace_type text := nullif(trim(coalesce(v_payload->>'workspace_type', v_payload->>'workspace_kind', '')), '');
  v_workspace_kind text := nullif(trim(coalesce(v_payload->>'workspace_kind', v_payload->>'workspace_type', '')), '');
  v_workspace_action text := nullif(trim(coalesce(v_payload->>'workspace_action', 'create_workspace')), '');
  v_app_role text;
  v_owner jsonb := coalesce(v_payload->'owner', '{}'::jsonb);
  v_owner_role text := nullif(trim(coalesce(v_owner->>'workspace_role', v_owner->>'organisation_role', '')), '');
  v_org_payload jsonb := coalesce(v_payload->'organisation', '{}'::jsonb);
  v_org_name text := nullif(trim(coalesce(v_org_payload->>'name', v_org_payload->>'legal_name', '')), '');
  v_trading_name text := nullif(trim(coalesce(v_org_payload->>'trading_name', v_org_payload->>'display_name', v_org_name, '')), '');
  v_registration_number text := nullif(trim(coalesce(v_org_payload->>'registration_number', '')), '');
  v_org_email text := nullif(lower(trim(coalesce(v_org_payload->>'email', v_org_payload->>'company_email', v_profile.email, ''))), '');
  v_org_phone text := nullif(trim(coalesce(v_org_payload->>'phone', v_org_payload->>'company_phone', '')), '');
  v_org_website text := nullif(trim(coalesce(v_org_payload->>'website', '')), '');
  v_org_address text := nullif(trim(coalesce(v_org_payload->>'address', v_org_payload->>'physical_address', '')), '');
  v_org_province text := nullif(trim(coalesce(v_org_payload->>'province', '')), '');
  v_org_country text := nullif(trim(coalesce(v_org_payload->>'country', 'South Africa')), '');
  v_branches jsonb := case when jsonb_typeof(v_payload->'branches') = 'array' then v_payload->'branches' else '[]'::jsonb end;
  v_branch_payload jsonb;
  v_branch_name text;
  v_branch_slug text;
  v_branch_id uuid;
  v_settings jsonb := coalesce(v_payload->'settings', '{}'::jsonb);
  v_invites jsonb := case when jsonb_typeof(v_payload->'invites') = 'array' then v_payload->'invites' else '[]'::jsonb end;
  v_invite jsonb;
  v_invite_email text;
  v_invite_role text;
  v_idempotency_key text := nullif(trim(coalesce(v_payload->>'idempotency_key', '')), '');
  v_existing_completion public.workspace_onboarding_completions%rowtype;
  v_duplicate_org_id uuid;
  v_duplicate_org_created_by uuid;
  v_resume_duplicate_workspace boolean := false;
  v_existing_membership public.organisation_users%rowtype;
  v_workspace_id uuid;
  v_membership_id uuid;
  v_now timestamptz := now();
  v_result jsonb;
  v_error_code text := 'onboarding_completion_failed';
  v_error_detail text := '';
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'code', 'permission_denied', 'message', 'You must be signed in to complete workspace onboarding.', 'details', '{}'::jsonb);
  end if;

  select * into v_profile
  from public.profiles
  where id = v_user_id;

  if not found then
    return jsonb_build_object('success', false, 'code', 'missing_profile', 'message', 'A profile is required before workspace onboarding can complete.', 'details', jsonb_build_object('user_id', v_user_id));
  end if;

  v_org_email := coalesce(v_org_email, nullif(lower(trim(coalesce(v_profile.email, ''))), ''));

  if v_workspace_type = 'developer' then
    v_workspace_type := 'developer_company';
  elsif v_workspace_type = 'bond_company' then
    v_workspace_type := 'bond_originator';
  end if;

  if v_workspace_kind = 'developer' then
    v_workspace_kind := 'developer_company';
  elsif v_workspace_kind = 'bond_company' then
    v_workspace_kind := 'bond_originator';
  end if;

  if v_workspace_type not in ('agency', 'developer_company', 'attorney_firm', 'bond_originator') then
    return jsonb_build_object('success', false, 'code', 'invalid_workspace_type', 'message', 'Workspace type is not supported for atomic onboarding.', 'details', jsonb_build_object('workspace_type', v_workspace_type));
  end if;

  if v_workspace_kind not in ('agency', 'developer_company', 'attorney_firm', 'bond_originator') then
    return jsonb_build_object('success', false, 'code', 'invalid_workspace_type', 'message', 'Workspace kind is not supported before personal workspaces are introduced.', 'details', jsonb_build_object('workspace_kind', v_workspace_kind));
  end if;

  v_app_role := case v_workspace_type
    when 'agency' then 'agent'
    when 'developer_company' then 'developer'
    when 'attorney_firm' then 'attorney'
    when 'bond_originator' then 'bond_originator'
    else v_profile.role
  end;

  if (
    v_workspace_type = 'agency'
    and coalesce(v_profile.role, '') not in ('agent', 'principal', 'owner', 'admin', 'super_admin')
  ) or (
    v_workspace_type = 'developer_company'
    and coalesce(v_profile.role, '') not in ('developer', 'owner', 'admin', 'super_admin')
  ) or (
    v_workspace_type = 'attorney_firm'
    and coalesce(v_profile.role, '') not in ('attorney', 'conveyancer', 'owner', 'admin', 'super_admin')
  ) or (
    v_workspace_type = 'bond_originator'
    and coalesce(v_profile.role, '') not in ('bond_originator', 'owner', 'admin', 'super_admin')
  ) then
    return jsonb_build_object('success', false, 'code', 'permission_denied', 'message', 'This profile role cannot create the requested workspace type.', 'details', jsonb_build_object('profile_role', v_profile.role, 'required_role', v_app_role));
  end if;

  if v_workspace_action <> 'create_workspace' then
    return jsonb_build_object('success', false, 'code', 'invalid_signup_intent', 'message', 'Atomic workspace onboarding only supports create-workspace signup intents in this phase.', 'details', jsonb_build_object('workspace_action', v_workspace_action));
  end if;

  if v_signup_intent_id is not null then
    select * into v_signup_intent
    from public.signup_intents
    where id = v_signup_intent_id
      and auth_user_id = v_user_id;

    if not found then
      return jsonb_build_object('success', false, 'code', 'invalid_signup_intent', 'message', 'Signup intent was not found for this user.', 'details', jsonb_build_object('signup_intent_id', v_signup_intent_id));
    end if;
  end if;

  v_idempotency_key := coalesce(
    v_idempotency_key,
    case when v_signup_intent_id is not null then v_signup_intent_id::text else null end,
    v_workspace_type || ':' || v_user_id::text || ':' || lower(coalesce(v_org_name, 'workspace'))
  );

  select * into v_existing_completion
  from public.workspace_onboarding_completions
  where user_id = v_user_id
    and idempotency_key = v_idempotency_key
    and status = 'completed'
  limit 1;

  if found then
    return coalesce(v_existing_completion.result, '{}'::jsonb)
      || jsonb_build_object('success', true, 'idempotent', true);
  end if;

  if v_signup_intent_id is not null then
    if v_signup_intent.status = 'consumed' then
      return jsonb_build_object('success', false, 'code', 'intent_already_consumed', 'message', 'Signup intent has already been consumed and no matching onboarding completion was found.', 'details', jsonb_build_object('signup_intent_id', v_signup_intent_id));
    end if;
    if v_signup_intent.workspace_action <> 'create_workspace' or v_signup_intent.workspace_type <> v_workspace_type then
      return jsonb_build_object('success', false, 'code', 'invalid_signup_intent', 'message', 'Signup intent does not match the requested workspace onboarding action.', 'details', jsonb_build_object('intent_workspace_action', v_signup_intent.workspace_action, 'intent_workspace_type', v_signup_intent.workspace_type));
    end if;
  end if;

  if v_org_name is null then
    return jsonb_build_object('success', false, 'code', 'invalid_workspace_type', 'message', 'Workspace name is required.', 'details', '{}'::jsonb);
  end if;

  if v_workspace_type in ('agency', 'attorney_firm', 'bond_originator') and jsonb_array_length(v_branches) < 1 then
    return jsonb_build_object('success', false, 'code', 'missing_default_workspace_unit', 'message', 'Workspace onboarding requires at least one active branch, office, or team.', 'details', '{}'::jsonb);
  end if;

  if v_settings ? '__proto__' or v_settings ? 'constructor' then
    return jsonb_build_object('success', false, 'code', 'invalid_settings', 'message', 'Workspace settings contain unsafe keys.', 'details', '{}'::jsonb);
  end if;

  if v_owner_role is null then
    v_owner_role := case v_workspace_type
      when 'agency' then 'principal'
      else 'owner'
    end;
  end if;

  if v_owner_role = 'super_admin' then
    v_owner_role := 'principal';
  end if;

  if v_owner_role not in ('owner', 'principal', 'director', 'partner', 'admin', 'branch_manager', 'manager', 'sales_manager', 'development_manager', 'developer', 'sales_agent', 'agent', 'attorney', 'conveyancer', 'consultant', 'processor', 'bond_originator', 'admin_staff', 'paralegal', 'viewer') then
    return jsonb_build_object('success', false, 'code', 'invalid_workspace_role', 'message', 'Workspace role is not valid.', 'details', jsonb_build_object('workspace_role', v_owner_role));
  end if;

  select id, created_by into v_duplicate_org_id, v_duplicate_org_created_by
  from public.organisations
  where type = v_workspace_type
    and (
      lower(trim(name)) = lower(v_org_name)
      or (
        v_registration_number is not null
        and registration_number is not null
        and lower(trim(registration_number)) = lower(v_registration_number)
      )
    )
  limit 1;

  if v_duplicate_org_id is not null then
    select * into v_existing_membership
    from public.organisation_users
    where organisation_id = v_duplicate_org_id
      and (
        user_id = v_user_id
        or lower(email) = lower(coalesce(v_profile.email, v_org_email))
      )
    order by
      case when user_id = v_user_id then 0 else 1 end,
      created_at asc
    limit 1;

    if found and v_existing_membership.user_id is not null and v_existing_membership.user_id <> v_user_id then
      return jsonb_build_object(
        'success', false,
        'code', 'duplicate_organisation_detected',
        'message', 'A workspace with this name or registration number already exists.',
        'details', jsonb_build_object('organisation_id', v_duplicate_org_id, 'recoverable', false)
      );
    end if;

    if v_duplicate_org_created_by = v_user_id or found then
      v_workspace_id := v_duplicate_org_id;
      v_resume_duplicate_workspace := true;
    else
      return jsonb_build_object(
        'success', false,
        'code', 'duplicate_organisation_detected',
        'message', 'A workspace with this name or registration number already exists.',
        'details', jsonb_build_object('organisation_id', v_duplicate_org_id, 'recoverable', false)
      );
    end if;
  end if;

  begin
    if v_resume_duplicate_workspace then
      v_error_code := 'organisation_resume_failed';
      update public.organisations
      set
        display_name = coalesce(v_trading_name, display_name, name),
        legal_name = coalesce(nullif(trim(coalesce(v_org_payload->>'legal_name', v_org_name)), ''), legal_name),
        registration_number = coalesce(v_registration_number, registration_number),
        company_email = coalesce(v_org_email, company_email),
        company_phone = coalesce(v_org_phone, company_phone),
        website = coalesce(v_org_website, website),
        address_line_1 = coalesce(v_org_address, address_line_1),
        province = coalesce(v_org_province, province),
        country = coalesce(v_org_country, country, 'South Africa'),
        support_email = coalesce(v_org_email, support_email),
        support_phone = coalesce(v_org_phone, support_phone),
        primary_contact_person = coalesce(nullif(trim(coalesce(v_payload #>> '{owner,full_name}', v_profile.full_name, v_profile.email, '')), ''), primary_contact_person),
        status = coalesce(status, 'active'),
        created_by = coalesce(created_by, v_user_id),
        settings_json = coalesce(settings_json, '{}'::jsonb)
          || jsonb_build_object('workspaceType', v_workspace_type, 'workspaceKind', v_workspace_kind, 'onboardingSource', 'bridge_complete_workspace_onboarding', 'resumedDuplicateAt', v_now),
        updated_at = v_now
      where id = v_workspace_id;
    else
      v_error_code := 'organisation_creation_failed';
      insert into public.organisations (
        name,
        display_name,
        type,
        legal_name,
        registration_number,
        company_email,
        company_phone,
        website,
        address_line_1,
        province,
        country,
        support_email,
        support_phone,
        primary_contact_person,
        status,
        created_by,
        settings_json
      )
      values (
        v_org_name,
        coalesce(v_trading_name, v_org_name),
        v_workspace_type,
        nullif(trim(coalesce(v_org_payload->>'legal_name', v_org_name)), ''),
        v_registration_number,
        v_org_email,
        v_org_phone,
        v_org_website,
        v_org_address,
        v_org_province,
        coalesce(v_org_country, 'South Africa'),
        v_org_email,
        v_org_phone,
        nullif(trim(coalesce(v_payload #>> '{owner,full_name}', v_profile.full_name, v_profile.email, '')), ''),
        'active',
        v_user_id,
        jsonb_build_object('workspaceType', v_workspace_type, 'workspaceKind', v_workspace_kind, 'onboardingSource', 'bridge_complete_workspace_onboarding')
      )
      returning id into v_workspace_id;
    end if;

    if v_workspace_type in ('agency', 'attorney_firm', 'bond_originator') then
      v_error_code := 'branch_creation_failed';
      v_branch_payload := v_branches->0;
      v_branch_name := nullif(trim(coalesce(v_branch_payload->>'name', v_branch_payload->>'branch_name', v_branch_payload->>'branchName', '')), '');
      if v_branch_name is null then
        raise exception 'Agency onboarding requires a named default branch.';
      end if;
      v_branch_slug := trim(both '-' from regexp_replace(lower(v_branch_name), '[^a-z0-9]+', '-', 'g'));
      if v_branch_slug is null or v_branch_slug = '' then
        v_branch_slug := 'main-branch';
      end if;

      if v_resume_duplicate_workspace then
        select id into v_branch_id
        from public.organisation_branches
        where organisation_id = v_workspace_id
          and is_active = true
        order by is_default desc, is_head_office desc, created_at asc
        limit 1;
      end if;

      if v_branch_id is null then
        insert into public.organisation_branches (
        organisation_id,
        name,
        slug,
        province,
        city,
        address,
        location,
        manager_name,
        principal_user_id,
        phone,
        email,
        is_head_office,
        is_default,
        is_active,
        status,
        agent_count,
        metadata_json,
        created_by
      )
      values (
        v_workspace_id,
        v_branch_name,
        v_branch_slug,
        nullif(trim(coalesce(v_branch_payload->>'province', v_org_province, '')), ''),
        nullif(trim(coalesce(v_branch_payload->>'city', '')), ''),
        nullif(trim(coalesce(v_branch_payload->>'address', v_branch_payload->>'officeLocation', v_org_address, '')), ''),
        nullif(trim(coalesce(v_branch_payload->>'location', v_branch_payload->>'officeLocation', v_org_province, '')), ''),
        nullif(trim(coalesce(v_branch_payload->>'manager_name', v_branch_payload->>'branchManager', v_profile.full_name, '')), ''),
        v_user_id,
        nullif(trim(coalesce(v_branch_payload->>'phone', v_org_phone, '')), ''),
        nullif(lower(trim(coalesce(v_branch_payload->>'email', v_org_email, ''))), ''),
        true,
        true,
        true,
        'active',
        coalesce(nullif(v_branch_payload->>'agent_count', '')::int, nullif(v_branch_payload->>'numberOfAgents', '')::int, 0),
        jsonb_build_object('defaultStructure', true, 'source', 'bridge_complete_workspace_onboarding', 'raw', v_branch_payload),
        v_user_id
        )
        returning id into v_branch_id;
      end if;
    end if;

    v_error_code := 'membership_conflict';
    select * into v_existing_membership
    from public.organisation_users
    where organisation_id = v_workspace_id
      and lower(email) = lower(coalesce(v_profile.email, v_org_email))
    limit 1;

    if found and v_existing_membership.user_id is not null and v_existing_membership.user_id <> v_user_id then
      raise exception 'An existing membership for this email belongs to another user.';
    end if;

    v_error_code := 'membership_creation_failed';
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
      app_role,
      workspace_type,
      status,
      permissions_json,
      invited_by_user_id,
      invited_at,
      joined_at,
      accepted_at,
      last_active_at,
      is_primary_owner,
      created_by
    )
    values (
      v_workspace_id,
      v_user_id,
      v_branch_id,
      v_branch_id,
      case
        when v_owner_role in ('owner', 'principal', 'director', 'partner') then 'all_branches'
        when v_owner_role in ('branch_manager', 'manager', 'admin_staff', 'processor', 'paralegal') then 'assigned_branch'
        else 'own'
      end,
      nullif(trim(coalesce(v_payload #>> '{owner,first_name}', v_profile.first_name, '')), ''),
      nullif(trim(coalesce(v_payload #>> '{owner,last_name}', v_profile.last_name, '')), ''),
      lower(coalesce(v_profile.email, v_org_email)),
      v_owner_role,
      v_owner_role,
      v_owner_role,
      v_app_role,
      v_workspace_type,
      'active',
      '{}'::jsonb,
      v_user_id,
      v_now,
      v_now,
      v_now,
      v_now,
      true,
      v_user_id
    )
    on conflict (organisation_id, email)
    do update set
      user_id = excluded.user_id,
      branch_id = coalesce(excluded.branch_id, public.organisation_users.branch_id),
      primary_branch_id = coalesce(excluded.primary_branch_id, public.organisation_users.primary_branch_id, public.organisation_users.branch_id),
      branch_scope = excluded.branch_scope,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      role = excluded.role,
      workspace_role = excluded.workspace_role,
      organisation_role = excluded.organisation_role,
      app_role = excluded.app_role,
      workspace_type = excluded.workspace_type,
      status = 'active',
      accepted_at = coalesce(public.organisation_users.accepted_at, excluded.accepted_at),
      joined_at = coalesce(public.organisation_users.joined_at, excluded.joined_at),
      last_active_at = excluded.last_active_at,
      is_primary_owner = true,
      created_by = coalesce(public.organisation_users.created_by, excluded.created_by),
      updated_at = v_now
    returning id into v_membership_id;

    v_error_code := 'settings_creation_failed';
    insert into public.organisation_settings (organisation_id, settings_json)
    values (
      v_workspace_id,
      v_settings
        || jsonb_build_object(
          'workspaceType', v_workspace_type,
          'workspaceKind', v_workspace_kind,
          'onboardingCompletedAt', v_now,
          'onboardingSource', 'bridge_complete_workspace_onboarding'
        )
    )
    on conflict (organisation_id)
    do update set
      settings_json = excluded.settings_json,
      updated_at = v_now;

    v_error_code := 'invite_creation_failed';
    for v_invite in select value from jsonb_array_elements(v_invites)
    loop
      v_invite_email := nullif(lower(trim(coalesce(v_invite->>'email', v_invite->>'invited_email', ''))), '');
      if v_invite_email is not null then
        v_invite_role := nullif(trim(coalesce(v_invite->>'workspace_role', v_invite->>'organisation_role', v_invite->>'role', 'agent')), '');
        if v_invite_role = 'administrator' then
          v_invite_role := 'admin_staff';
        end if;

        insert into public.workspace_invites (
          workspace_id,
          workspace_type,
          invited_email,
          app_role,
          organisation_role,
          branch_id,
          status,
          expires_at,
          invited_by
        )
        values (
          v_workspace_id,
          v_workspace_type,
          v_invite_email,
          v_app_role,
          v_invite_role,
          v_branch_id,
          'pending',
          v_now + interval '14 days',
          v_user_id
        );
      end if;
    end loop;

    v_error_code := 'onboarding_state_failed';
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
      recovery_reason,
      completed_at
    )
    values (
      v_user_id,
      'onboarding_completed',
      'onboarding_complete',
      coalesce(v_signup_intent.onboarding_path, v_payload->>'onboarding_path'),
      'create_workspace',
      v_workspace_type,
      v_app_role,
      v_owner_role,
      'onboarding_review',
      jsonb_build_object(
        'source', 'bridge_complete_workspace_onboarding',
        'workspaceId', v_workspace_id,
        'membershipId', v_membership_id,
        'branchId', v_branch_id
      ),
      null,
      v_now
    )
    on conflict (user_id)
    do update set
      onboarding_status = excluded.onboarding_status,
      onboarding_step = excluded.onboarding_step,
      onboarding_path = excluded.onboarding_path,
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
      v_workspace_id,
      'onboarding_complete',
      'workspace_onboarding_completed',
      jsonb_build_object(
        'source', 'bridge_complete_workspace_onboarding',
        'resumedDuplicateWorkspace', v_resume_duplicate_workspace,
        'workspaceType', v_workspace_type,
        'workspaceRole', v_owner_role,
        'membershipId', v_membership_id,
        'branchId', v_branch_id,
        'signupIntentId', v_signup_intent_id
      )
    );

    v_error_code := 'active_workspace_preference_failed';
    insert into public.user_workspace_preferences (
      user_id,
      active_workspace_id,
      active_workspace_source
    )
    values (
      v_user_id,
      v_workspace_id,
      'system_recovery'
    )
    on conflict (user_id)
    do update set
      active_workspace_id = excluded.active_workspace_id,
      active_workspace_source = excluded.active_workspace_source,
      updated_at = v_now;

    v_error_code := 'profile_update_failed';
    update public.profiles
    set
      role = v_app_role,
      company_name = v_org_name,
      onboarding_completed = true,
      updated_at = v_now
    where id = v_user_id;

    if v_signup_intent_id is not null then
      update public.signup_intents
      set
        status = 'consumed',
        consumed_at = v_now,
        updated_at = v_now
      where id = v_signup_intent_id
        and auth_user_id = v_user_id;
    end if;

    v_result := jsonb_build_object(
      'success', true,
      'idempotent', false,
      'resumed_duplicate_workspace', v_resume_duplicate_workspace,
      'workspace_id', v_workspace_id,
      'organisation_id', v_workspace_id,
      'branch_id', v_branch_id,
      'membership_id', v_membership_id,
      'workspace_type', v_workspace_type,
      'workspace_kind', v_workspace_kind,
      'workspace_role', v_owner_role,
      'active_workspace_id', v_workspace_id,
      'organisation', jsonb_build_object(
        'id', v_workspace_id,
        'name', v_org_name,
        'display_name', coalesce(v_trading_name, v_org_name),
        'type', v_workspace_type
      )
    );

    insert into public.workspace_onboarding_completions (
      user_id,
      signup_intent_id,
      idempotency_key,
      workspace_id,
      status,
      result
    )
    values (
      v_user_id,
      v_signup_intent_id,
      v_idempotency_key,
      v_workspace_id,
      'completed',
      v_result
    )
    on conflict (user_id, idempotency_key)
    do update set
      signup_intent_id = excluded.signup_intent_id,
      workspace_id = excluded.workspace_id,
      status = excluded.status,
      result = excluded.result,
      updated_at = v_now;

    return v_result;
  exception
    when others then
      get stacked diagnostics v_error_detail = PG_EXCEPTION_DETAIL;
      return jsonb_build_object(
        'success', false,
        'code', v_error_code,
        'message', SQLERRM,
        'details', jsonb_build_object(
          'sqlstate', SQLSTATE,
          'detail', coalesce(v_error_detail, ''),
          'workspace_type', v_workspace_type,
          'signup_intent_id', v_signup_intent_id
        )
      );
  end;
end;
$$;

grant execute on function public.bridge_complete_workspace_onboarding(jsonb) to authenticated;

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
  v_now timestamptz := now();
begin
  if v_actor_id is null or v_actor_id <> v_user_id then
    return jsonb_build_object('success', false, 'code', 'permission_denied', 'message', 'You can only repair your own onboarding state.', 'details', '{}'::jsonb);
  end if;

  select * into v_profile from public.profiles where id = v_user_id;
  if not found then
    return jsonb_build_object('success', false, 'code', 'missing_profile', 'message', 'Profile is missing.', 'details', jsonb_build_object('user_id', v_user_id));
  end if;

  select * into v_membership
  from public.organisation_users
  where user_id = v_user_id
    and status = 'active'
  order by is_primary_owner desc, updated_at desc nulls last, created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'code', 'no_active_membership', 'message', 'No active workspace membership could be repaired.', 'details', '{}'::jsonb);
  end if;

  select * into v_workspace
  from public.organisations
  where id = v_membership.organisation_id;

  if not found then
    return jsonb_build_object('success', false, 'code', 'workspace_missing', 'message', 'The active membership points to a missing workspace.', 'details', jsonb_build_object('organisation_id', v_membership.organisation_id));
  end if;

  if coalesce(v_workspace.type, v_membership.workspace_type) in ('agency', 'attorney_firm', 'bond_originator') then
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
        jsonb_build_object('source', 'bridge_repair_workspace_onboarding'),
        v_user_id
      )
      returning id into v_branch_id;
    end if;

    update public.organisation_users
    set
      branch_id = coalesce(branch_id, v_branch_id),
      primary_branch_id = coalesce(primary_branch_id, branch_id, v_branch_id),
      branch_scope = case
        when coalesce(workspace_role, organisation_role, role) in ('owner', 'principal', 'director', 'partner') then 'all_branches'
        when coalesce(workspace_role, organisation_role, role) in ('branch_manager', 'manager', 'admin_staff', 'processor', 'paralegal') then 'assigned_branch'
        else coalesce(branch_scope, 'own')
      end,
      workspace_role = coalesce(workspace_role, organisation_role, role),
      organisation_role = coalesce(organisation_role, workspace_role, role),
      workspace_type = coalesce(workspace_type, v_workspace.type),
      app_role = coalesce(app_role, v_profile.role),
      updated_at = v_now
    where id = v_membership.id;
  end if;

  insert into public.organisation_settings (organisation_id, settings_json)
  values (
    v_workspace.id,
    jsonb_build_object(
      'workspaceType', coalesce(v_workspace.type, v_membership.workspace_type),
      'repairedAt', v_now,
      'repairSource', 'bridge_repair_workspace_onboarding'
    )
  )
  on conflict (organisation_id)
  do update set
    settings_json = coalesce(public.organisation_settings.settings_json, '{}'::jsonb)
      || jsonb_build_object('repairedAt', v_now, 'repairSource', 'bridge_repair_workspace_onboarding'),
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
    coalesce(v_workspace.type, v_membership.workspace_type),
    coalesce(v_profile.role, v_membership.app_role),
    coalesce(v_membership.workspace_role, v_membership.organisation_role, v_membership.role),
    'onboarding_review',
    jsonb_build_object('source', 'bridge_repair_workspace_onboarding', 'workspaceId', v_workspace.id, 'membershipId', v_membership.id, 'branchId', v_branch_id),
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
    jsonb_build_object('source', 'bridge_repair_workspace_onboarding', 'membershipId', v_membership.id, 'branchId', v_branch_id)
  );

  update public.profiles
  set
    onboarding_completed = true,
    updated_at = v_now
  where id = v_user_id;

  return jsonb_build_object(
    'success', true,
    'workspace_id', v_workspace.id,
    'organisation_id', v_workspace.id,
    'membership_id', v_membership.id,
    'branch_id', v_branch_id,
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
