begin;

-- Admin CRM intake leads Phase 7
-- Converts an approved intake lead into a pending customer organisation without
-- granting the Arch9 operator membership in the customer's workspace.

create table if not exists public.demo_enquiry_conversions (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null unique references public.demo_enquiries(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  conversion_mode text not null,
  onboarding_status text not null default 'ready',
  actor_user_id uuid references auth.users(id) on delete set null,
  conversion_snapshot jsonb not null default '{}'::jsonb,
  converted_at timestamptz not null default now(),
  constraint demo_enquiry_conversions_mode_check check (conversion_mode in ('created', 'linked')),
  constraint demo_enquiry_conversions_onboarding_status_check check (onboarding_status in ('ready', 'invited', 'activated'))
);

create index if not exists demo_enquiry_conversions_organisation_idx
  on public.demo_enquiry_conversions (organisation_id, converted_at desc);

alter table public.demo_enquiry_conversions enable row level security;
revoke all on table public.demo_enquiry_conversions from public, anon, authenticated;

create or replace function public.arch9_admin_intake_conversion_context_v1(
  p_enquiry_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead public.demo_enquiries%rowtype;
  v_eligible boolean;
  v_blockers text[] := '{}'::text[];
  v_result jsonb;
begin
  if not public.bridge_is_platform_admin() then
    raise exception 'Admin intake conversion access is required.' using errcode = '42501';
  end if;

  select * into v_lead
  from public.demo_enquiries
  where id = p_enquiry_id;

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  if v_lead.converted_organisation_id is not null then
    v_blockers := array_append(v_blockers, 'already_converted');
  end if;
  if v_lead.sales_stage not in ('qualified', 'demo_scheduled', 'proposal', 'won') then
    v_blockers := array_append(v_blockers, 'lead_not_qualified');
  end if;
  if v_lead.dedupe_status <> 'canonical' then
    v_blockers := array_append(v_blockers, 'duplicate_review_required');
  end if;

  v_eligible := cardinality(v_blockers) = 0;

  select jsonb_build_object(
    'version', 1,
    'eligible', v_eligible,
    'blockers', to_jsonb(v_blockers),
    'defaults', jsonb_build_object(
      'name', v_lead.company,
      'email', v_lead.email,
      'phone', v_lead.phone,
      'organizationType', case
        when lower(coalesce(v_lead.role, '')) ~ '(attorney|conveyanc|law)' then 'attorney_firm'
        when lower(coalesce(v_lead.role, '')) ~ '(bond|originat)' then 'bond_originator'
        when lower(coalesce(v_lead.role, '')) ~ '(develop)' then 'developer'
        else 'agency'
      end
    ),
    'convertedOrganization', case
      when converted.id is null then null
      else jsonb_build_object(
        'id', converted.id,
        'name', coalesce(converted.display_name, converted.name),
        'organizationType', coalesce(converted.organization_type, converted.type),
        'status', converted.status
      )
    end,
    'matchingOrganizations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', candidate.id,
        'name', coalesce(candidate.display_name, candidate.name),
        'organizationType', coalesce(candidate.organization_type, candidate.type),
        'status', candidate.status,
        'email', coalesce(candidate.email, candidate.company_email, candidate.billing_email),
        'matchReasons', array_remove(array[
          case when lower(trim(coalesce(candidate.name, ''))) = lower(trim(coalesce(v_lead.company, ''))) then 'company' end,
          case when lower(trim(coalesce(candidate.email, candidate.company_email, candidate.billing_email, ''))) = lower(trim(coalesce(v_lead.email, ''))) then 'email' end
        ], null)
      ) order by candidate.created_at desc)
      from (
        select organisation.*
        from public.organisations organisation
        where (
          coalesce(trim(v_lead.company), '') <> ''
          and lower(trim(coalesce(organisation.name, ''))) = lower(trim(v_lead.company))
        ) or (
          coalesce(trim(v_lead.email), '') <> ''
          and lower(trim(coalesce(organisation.email, organisation.company_email, organisation.billing_email, ''))) = lower(trim(v_lead.email))
        )
        order by organisation.created_at desc
        limit 10
      ) candidate
    ), '[]'::jsonb)
  ) into v_result
  from (select 1) seed
  left join public.organisations converted on converted.id = v_lead.converted_organisation_id;

  return v_result;
end;
$$;

revoke all on function public.arch9_admin_intake_conversion_context_v1(uuid) from public, anon, authenticated, service_role;
grant execute on function public.arch9_admin_intake_conversion_context_v1(uuid) to authenticated;

create or replace function public.arch9_admin_convert_intake_lead_v1(
  p_enquiry_id uuid,
  p_mode text,
  p_organisation jsonb default '{}'::jsonb,
  p_existing_organisation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_mode text := lower(trim(coalesce(p_mode, '')));
  v_lead public.demo_enquiries%rowtype;
  v_org public.organisations%rowtype;
  v_name text;
  v_email text;
  v_phone text;
  v_website text;
  v_org_type text;
  v_workspace_type text;
  v_workspace_kind text;
  v_existing_id uuid;
  v_conversion public.demo_enquiry_conversions%rowtype;
begin
  if not public.bridge_is_platform_admin() then
    raise exception 'Admin intake conversion access is required.' using errcode = '42501';
  end if;

  if v_mode not in ('create', 'link') then
    raise exception 'Choose whether to create or link an organisation.' using errcode = '22023';
  end if;

  select * into v_lead
  from public.demo_enquiries
  where id = p_enquiry_id
  for update;

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  if v_lead.converted_organisation_id is not null then
    select * into v_org from public.organisations where id = v_lead.converted_organisation_id;
    return jsonb_build_object(
      'success', true,
      'alreadyConverted', true,
      'organization', jsonb_build_object('id', v_org.id, 'name', coalesce(v_org.display_name, v_org.name), 'status', v_org.status)
    );
  end if;

  if v_lead.sales_stage not in ('qualified', 'demo_scheduled', 'proposal', 'won') then
    raise exception 'Qualify this lead before converting it.' using errcode = '22023';
  end if;

  if v_lead.dedupe_status <> 'canonical' then
    raise exception 'Complete the duplicate review before converting this lead.' using errcode = '22023';
  end if;

  if v_mode = 'link' then
    if p_existing_organisation_id is null then
      raise exception 'Select an existing organisation to link.' using errcode = '22023';
    end if;

    select * into v_org
    from public.organisations
    where id = p_existing_organisation_id
      and status not in ('archived', 'suspended');

    if not found then
      raise exception 'Existing organisation not found or unavailable.' using errcode = 'P0002';
    end if;
  else
    v_name := nullif(trim(coalesce(p_organisation->>'name', v_lead.company, '')), '');
    v_email := nullif(lower(trim(coalesce(p_organisation->>'email', v_lead.email, ''))), '');
    v_phone := nullif(trim(coalesce(p_organisation->>'phone', v_lead.phone, '')), '');
    v_website := nullif(trim(coalesce(p_organisation->>'website', '')), '');
    v_org_type := public.bridge_phase3_normalize_organization_type(coalesce(p_organisation->>'organizationType', p_organisation->>'organization_type', ''));
    v_workspace_type := public.bridge_phase3_workspace_type(v_org_type);
    v_workspace_kind := case when v_org_type = 'bond_originator' then 'bond_company' else v_workspace_type end;

    if v_name is null then
      raise exception 'Organisation name is required.' using errcode = '22023';
    end if;

    select id into v_existing_id
    from public.organisations
    where lower(trim(name)) = lower(v_name)
      and public.bridge_phase3_normalize_organization_type(coalesce(organization_type, type)) = v_org_type
    limit 1;

    if v_existing_id is not null then
      raise exception 'An organisation with this name and type already exists. Link it instead.' using errcode = '22023';
    end if;

    insert into public.organisations (
      name,
      display_name,
      type,
      workspace_kind,
      organization_type,
      email,
      phone,
      website,
      company_email,
      company_phone,
      billing_email,
      support_email,
      support_phone,
      status,
      settings_json,
      created_by
    ) values (
      v_name,
      v_name,
      v_workspace_type,
      v_workspace_kind,
      v_org_type,
      v_email,
      v_phone,
      v_website,
      v_email,
      v_phone,
      v_email,
      v_email,
      v_phone,
      'pending',
      jsonb_build_object(
        'workspaceKind', v_workspace_kind,
        'onboardingStatus', 'ready',
        'createdFrom', 'admin_intake_lead',
        'sourceEnquiryId', v_lead.id,
        'sourceContactEmail', v_lead.email
      ),
      v_actor
    ) returning * into v_org;
  end if;

  insert into public.demo_enquiry_conversions (
    enquiry_id,
    organisation_id,
    conversion_mode,
    actor_user_id,
    conversion_snapshot
  ) values (
    v_lead.id,
    v_org.id,
    case when v_mode = 'create' then 'created' else 'linked' end,
    v_actor,
    jsonb_build_object(
      'leadStageBefore', v_lead.sales_stage,
      'leadCompany', v_lead.company,
      'leadEmail', v_lead.email,
      'organizationName', coalesce(v_org.display_name, v_org.name),
      'organizationType', coalesce(v_org.organization_type, v_org.type)
    )
  ) returning * into v_conversion;

  update public.demo_enquiries
  set converted_organisation_id = v_org.id,
      sales_stage = 'won',
      status = 'closed',
      closed_at = coalesce(closed_at, now()),
      next_action = null,
      next_action_at = null
  where id = v_lead.id;

  insert into public.platform_activity_events (
    organisation_id,
    actor_user_id,
    activity_type,
    event_type,
    title,
    description,
    summary,
    severity,
    occurred_at
  ) values (
    v_org.id,
    v_actor,
    'intake_lead_converted',
    'demo_enquiry_converted',
    'New business lead converted',
    coalesce(v_org.display_name, v_org.name),
    jsonb_build_object('enquiryId', v_lead.id, 'conversionId', v_conversion.id, 'mode', v_conversion.conversion_mode)::text,
    'info',
    now()
  );

  return jsonb_build_object(
    'success', true,
    'alreadyConverted', false,
    'conversion', jsonb_build_object(
      'id', v_conversion.id,
      'mode', v_conversion.conversion_mode,
      'onboardingStatus', v_conversion.onboarding_status,
      'convertedAt', v_conversion.converted_at
    ),
    'organization', jsonb_build_object(
      'id', v_org.id,
      'name', coalesce(v_org.display_name, v_org.name),
      'organizationType', coalesce(v_org.organization_type, v_org.type),
      'status', v_org.status
    )
  );
end;
$$;

revoke all on function public.arch9_admin_convert_intake_lead_v1(uuid, text, jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.arch9_admin_convert_intake_lead_v1(uuid, text, jsonb, uuid) to authenticated;

commit;
