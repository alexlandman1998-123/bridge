begin;

alter table if exists public.organisations
  add column if not exists vat_number text,
  add column if not exists primary_colour text,
  add column if not exists secondary_colour text,
  add column if not exists logo_dark_url text,
  add column if not exists logo_bucket text,
  add column if not exists logo_path text,
  add column if not exists logo_dark_bucket text,
  add column if not exists logo_dark_path text;

alter table if exists public.attorney_firm_branding
  add column if not exists logo_bucket text,
  add column if not exists logo_path text,
  add column if not exists logo_dark_bucket text,
  add column if not exists logo_dark_path text;

create or replace function public.bridge_complete_attorney_firm_onboarding_v2(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(payload, '{}'::jsonb);
  v_firm_info jsonb := coalesce(v_payload -> 'firmInformation', '{}'::jsonb);
  v_branding_info jsonb := coalesce(v_payload -> 'branding', '{}'::jsonb);
  v_user_id uuid := auth.uid();
  v_requested_firm_id uuid;
  v_firm_id uuid;
  v_org_id uuid;
  v_name text := nullif(trim(coalesce(v_firm_info ->> 'name', '')), '');
  v_active_department_types text[] := array['management']::text[];
  v_firm public.attorney_firms%rowtype;
  v_org public.organisations%rowtype;
  v_branding public.attorney_firm_branding%rowtype;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'Firm name is required.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(v_payload ->> 'firmId', '')), '') is not null then
    begin
      v_requested_firm_id := (v_payload ->> 'firmId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Firm id is invalid.' using errcode = '22023';
    end;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select coalesce(
    array_agg(distinct department_type) filter (
      where department_type in ('transfer', 'bond', 'admin', 'management')
    ),
    array[]::text[]
  )
  into v_active_department_types
  from jsonb_array_elements_text(
    case
      when jsonb_typeof(v_payload -> 'activeDepartmentTypes') = 'array'
        then v_payload -> 'activeDepartmentTypes'
      else '[]'::jsonb
    end
  ) as department_rows(department_type);

  if not ('management' = any(v_active_department_types)) then
    v_active_department_types := array_append(v_active_department_types, 'management');
  end if;

  if v_requested_firm_id is not null then
    select f.id
    into v_firm_id
    from public.attorney_firms f
    where f.id = v_requested_firm_id
      and (
        f.created_by = v_user_id
        or exists (
          select 1
          from public.attorney_firm_members member
          where member.firm_id = f.id
            and member.user_id = v_user_id
            and member.status = 'active'
            and member.role in ('firm_admin', 'director_partner')
        )
      )
    for update;

    if v_firm_id is null then
      raise exception 'Permission denied for attorney firm onboarding.' using errcode = '42501';
    end if;
  end if;

  if v_firm_id is null then
    select p.primary_attorney_firm_id
    into v_firm_id
    from public.profiles p
    where p.id = v_user_id
      and p.primary_attorney_firm_id is not null
      and exists (
        select 1
        from public.attorney_firms f
        where f.id = p.primary_attorney_firm_id
          and (
            f.created_by = v_user_id
            or exists (
              select 1
              from public.attorney_firm_members member
              where member.firm_id = f.id
                and member.user_id = v_user_id
                and member.status = 'active'
                and member.role in ('firm_admin', 'director_partner')
            )
          )
      );
  end if;

  if v_firm_id is null then
    select f.id
    into v_firm_id
    from public.attorney_firms f
    where f.created_by = v_user_id
      and lower(trim(f.name)) = lower(v_name)
    order by f.created_at desc
    limit 1
    for update;
  end if;

  if v_firm_id is null then
    insert into public.attorney_firms (
      name,
      registration_number,
      vat_number,
      website,
      email,
      phone,
      address_line_1,
      address_line_2,
      city,
      province,
      postal_code,
      country,
      logo_url,
      primary_colour,
      secondary_colour,
      created_by,
      is_active
    )
    values (
      v_name,
      nullif(trim(v_firm_info ->> 'registrationNumber'), ''),
      nullif(trim(v_firm_info ->> 'vatNumber'), ''),
      nullif(trim(v_firm_info ->> 'website'), ''),
      nullif(lower(trim(v_firm_info ->> 'email')), ''),
      nullif(trim(v_firm_info ->> 'phone'), ''),
      nullif(trim(v_firm_info ->> 'addressLine1'), ''),
      nullif(trim(v_firm_info ->> 'addressLine2'), ''),
      nullif(trim(v_firm_info ->> 'city'), ''),
      nullif(trim(v_firm_info ->> 'province'), ''),
      nullif(trim(v_firm_info ->> 'postalCode'), ''),
      coalesce(nullif(trim(v_firm_info ->> 'country'), ''), 'South Africa'),
      nullif(trim(v_branding_info ->> 'logoUrl'), ''),
      nullif(trim(v_branding_info ->> 'primaryColour'), ''),
      nullif(trim(v_branding_info ->> 'secondaryColour'), ''),
      v_user_id,
      true
    )
    returning id into v_firm_id;
  else
    update public.attorney_firms
    set
      name = v_name,
      registration_number = nullif(trim(v_firm_info ->> 'registrationNumber'), ''),
      vat_number = nullif(trim(v_firm_info ->> 'vatNumber'), ''),
      website = nullif(trim(v_firm_info ->> 'website'), ''),
      email = nullif(lower(trim(v_firm_info ->> 'email')), ''),
      phone = nullif(trim(v_firm_info ->> 'phone'), ''),
      address_line_1 = nullif(trim(v_firm_info ->> 'addressLine1'), ''),
      address_line_2 = nullif(trim(v_firm_info ->> 'addressLine2'), ''),
      city = nullif(trim(v_firm_info ->> 'city'), ''),
      province = nullif(trim(v_firm_info ->> 'province'), ''),
      postal_code = nullif(trim(v_firm_info ->> 'postalCode'), ''),
      country = coalesce(nullif(trim(v_firm_info ->> 'country'), ''), 'South Africa'),
      logo_url = nullif(trim(v_branding_info ->> 'logoUrl'), ''),
      primary_colour = nullif(trim(v_branding_info ->> 'primaryColour'), ''),
      secondary_colour = nullif(trim(v_branding_info ->> 'secondaryColour'), ''),
      is_active = true,
      updated_at = v_now
    where id = v_firm_id;
  end if;

  insert into public.attorney_firm_members (
    firm_id,
    user_id,
    role,
    status,
    invited_by,
    joined_at
  )
  values (
    v_firm_id,
    v_user_id,
    'firm_admin',
    'active',
    v_user_id,
    v_now
  )
  on conflict (firm_id, user_id)
  do update set
    role = 'firm_admin',
    status = 'active',
    invited_by = coalesce(public.attorney_firm_members.invited_by, v_user_id),
    joined_at = coalesce(public.attorney_firm_members.joined_at, v_now),
    updated_at = v_now;

  v_org_id := public.bridge_ensure_attorney_firm_organisation(v_firm_id);

  insert into public.attorney_firm_branding (
    firm_id,
    logo_url,
    logo_bucket,
    logo_path,
    logo_dark_url,
    logo_dark_bucket,
    logo_dark_path,
    primary_colour,
    secondary_colour,
    created_by
  )
  values (
    v_firm_id,
    nullif(trim(v_branding_info ->> 'logoUrl'), ''),
    nullif(trim(v_branding_info ->> 'logoBucket'), ''),
    nullif(trim(v_branding_info ->> 'logoPath'), ''),
    nullif(trim(v_branding_info ->> 'logoDarkUrl'), ''),
    nullif(trim(v_branding_info ->> 'logoDarkBucket'), ''),
    nullif(trim(v_branding_info ->> 'logoDarkPath'), ''),
    nullif(trim(v_branding_info ->> 'primaryColour'), ''),
    nullif(trim(v_branding_info ->> 'secondaryColour'), ''),
    v_user_id
  )
  on conflict (firm_id)
  do update set
    logo_url = excluded.logo_url,
    logo_bucket = excluded.logo_bucket,
    logo_path = excluded.logo_path,
    logo_dark_url = excluded.logo_dark_url,
    logo_dark_bucket = excluded.logo_dark_bucket,
    logo_dark_path = excluded.logo_dark_path,
    primary_colour = excluded.primary_colour,
    secondary_colour = excluded.secondary_colour,
    updated_at = v_now
  returning * into v_branding;

  update public.organisations
  set
    name = v_name,
    display_name = v_name,
    legal_name = v_name,
    registration_number = nullif(trim(v_firm_info ->> 'registrationNumber'), ''),
    vat_number = nullif(trim(v_firm_info ->> 'vatNumber'), ''),
    type = 'attorney_firm',
    workspace_kind = 'attorney_firm',
    company_email = nullif(lower(trim(v_firm_info ->> 'email')), ''),
    company_phone = nullif(trim(v_firm_info ->> 'phone'), ''),
    website = nullif(trim(v_firm_info ->> 'website'), ''),
    address = nullif(trim(v_firm_info ->> 'addressLine1'), ''),
    address_line_1 = nullif(trim(v_firm_info ->> 'addressLine1'), ''),
    address_line_2 = nullif(trim(v_firm_info ->> 'addressLine2'), ''),
    formatted_address = nullif(trim(concat_ws(', ',
      nullif(trim(v_firm_info ->> 'addressLine1'), ''),
      nullif(trim(v_firm_info ->> 'addressLine2'), ''),
      nullif(trim(v_firm_info ->> 'city'), ''),
      nullif(trim(v_firm_info ->> 'province'), ''),
      nullif(trim(v_firm_info ->> 'postalCode'), '')
    )), ''),
    city = nullif(trim(v_firm_info ->> 'city'), ''),
    province = nullif(trim(v_firm_info ->> 'province'), ''),
    postal_code = nullif(trim(v_firm_info ->> 'postalCode'), ''),
    country = coalesce(nullif(trim(v_firm_info ->> 'country'), ''), 'South Africa'),
    logo_url = nullif(trim(v_branding_info ->> 'logoUrl'), ''),
    logo_bucket = nullif(trim(v_branding_info ->> 'logoBucket'), ''),
    logo_path = nullif(trim(v_branding_info ->> 'logoPath'), ''),
    logo_dark_url = nullif(trim(v_branding_info ->> 'logoDarkUrl'), ''),
    logo_dark_bucket = nullif(trim(v_branding_info ->> 'logoDarkBucket'), ''),
    logo_dark_path = nullif(trim(v_branding_info ->> 'logoDarkPath'), ''),
    primary_colour = nullif(trim(v_branding_info ->> 'primaryColour'), ''),
    secondary_colour = nullif(trim(v_branding_info ->> 'secondaryColour'), ''),
    support_email = nullif(lower(trim(v_firm_info ->> 'email')), ''),
    support_phone = nullif(trim(v_firm_info ->> 'phone'), ''),
    status = 'active',
    settings_json = coalesce(settings_json, '{}'::jsonb) || jsonb_build_object(
      'workspaceType', 'attorney_firm',
      'attorneyFirmId', v_firm_id,
      'source', 'attorney_onboarding_v2'
    ),
    updated_at = v_now
  where id = v_org_id
  returning * into v_org;

  update public.attorney_firms
  set organisation_id = v_org_id, updated_at = v_now
  where id = v_firm_id
  returning * into v_firm;

  insert into public.organisation_settings (organisation_id, settings_json)
  values (
    v_org_id,
    jsonb_build_object(
      'workspaceType', 'attorney_firm',
      'attorneyFirmId', v_firm_id,
      'source', 'attorney_onboarding_v2'
    )
  )
  on conflict (organisation_id)
  do update set
    settings_json = coalesce(public.organisation_settings.settings_json, '{}'::jsonb) || excluded.settings_json,
    updated_at = v_now;

  insert into public.attorney_firm_departments (firm_id, name, department_type, is_active)
  values
    (v_firm_id, 'Transfer Department', 'transfer', 'transfer' = any(v_active_department_types)),
    (v_firm_id, 'Bond Department', 'bond', 'bond' = any(v_active_department_types)),
    (v_firm_id, 'Admin Department', 'admin', 'admin' = any(v_active_department_types)),
    (v_firm_id, 'Management', 'management', true)
  on conflict (firm_id, department_type)
  do update set
    is_active = excluded.is_active,
    updated_at = v_now;

  update public.profiles
  set
    primary_attorney_firm_id = v_firm_id,
    attorney_role = 'firm_admin',
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
    recovery_reason,
    completed_at
  )
  values (
    v_user_id,
    'onboarding_completed',
    'onboarding_complete',
    '/attorney/onboarding',
    'create_workspace',
    'attorney_firm',
    'attorney',
    'firm_admin',
    'onboarding_review',
    jsonb_build_object(
      'source', 'attorney_onboarding_v2',
      'completedByAtomicRpc', true,
      'firmId', v_firm_id,
      'organisationId', v_org_id
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
    onboarding_context_json = coalesce(public.onboarding_states.onboarding_context_json, '{}'::jsonb) || excluded.onboarding_context_json,
    recovery_reason = null,
    completed_at = v_now,
    updated_at = v_now;

  insert into public.workspace_onboarding_completions (
    user_id,
    idempotency_key,
    workspace_id,
    status,
    result
  )
  values (
    v_user_id,
    'attorney_firm_onboarding_v2',
    v_org_id,
    'completed',
    jsonb_build_object(
      'success', true,
      'firm_id', v_firm_id,
      'organisation_id', v_org_id,
      'workspace_type', 'attorney_firm'
    )
  )
  on conflict (user_id, idempotency_key)
  do update set
    workspace_id = excluded.workspace_id,
    status = 'completed',
    result = excluded.result,
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
    v_org_id,
    'onboarding_complete',
    'onboarding_completed',
    jsonb_build_object(
      'source', 'attorney_onboarding_v2',
      'firmId', v_firm_id,
      'organisationId', v_org_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'firm', to_jsonb(v_firm),
    'organisation', to_jsonb(v_org),
    'branding', to_jsonb(v_branding),
    'departments', coalesce((
      select jsonb_agg(to_jsonb(department) order by department.department_type)
      from public.attorney_firm_departments department
      where department.firm_id = v_firm_id
    ), '[]'::jsonb),
    'workspace_id', v_org_id,
    'workspace_type', 'attorney_firm'
  );
end;
$$;

revoke all on function public.bridge_complete_attorney_firm_onboarding_v2(jsonb) from public;
grant execute on function public.bridge_complete_attorney_firm_onboarding_v2(jsonb) to authenticated;

commit;
