create table if not exists public.transaction_bond_originator_one_originator_pilots (
  id uuid primary key default gen_random_uuid(),
  pilot_version text not null default 'phase-r6-one-originator-pilot-v1',
  status text not null default 'draft',
  pilot_originator_profile_id uuid references public.profiles(id) on delete set null,
  pilot_originator_email_reference text,
  pilot_originator_name text,
  maximum_active_originators integer not null default 1 check (maximum_active_originators = 1),
  readiness_report_id uuid references public.transaction_bond_originator_internal_readiness_reports(id) on delete set null,
  governance_report_id uuid references public.transaction_bond_application_governance_reports(id) on delete set null,
  pilot_package_ids_json jsonb not null default '[]'::jsonb,
  pilot_controls_json jsonb not null default '{}'::jsonb,
  pilot_report_json jsonb not null default '{}'::jsonb,
  started_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz,
  paused_by uuid references public.profiles(id) on delete set null,
  paused_at timestamptz,
  pause_reason text,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  idempotency_key text,
  sensitive_payload_included boolean not null default false check (sensitive_payload_included = false),
  no_automatic_bank_submission boolean not null default true check (no_automatic_bank_submission = true),
  live_delivery_enabled boolean not null default false check (live_delivery_enabled = false),
  bank_workflow_unchanged boolean not null default true check (bank_workflow_unchanged = true),
  offer_workflow_unchanged boolean not null default true check (offer_workflow_unchanged = true),
  grant_workflow_unchanged boolean not null default true check (grant_workflow_unchanged = true),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint transaction_bond_originator_one_originator_pilots_status_check check (
    status in ('draft', 'ready', 'active', 'paused', 'completed', 'blocked')
  ),
  constraint transaction_bond_originator_one_originator_pilots_version_check check (
    pilot_version = 'phase-r6-one-originator-pilot-v1'
  ),
  constraint transaction_bond_originator_one_originator_pilots_originator_check check (
    pilot_originator_profile_id is not null or nullif(trim(pilot_originator_email_reference), '') is not null
  ),
  constraint transaction_bond_originator_one_originator_pilots_boundary_check check (
    maximum_active_originators = 1
    and sensitive_payload_included = false
    and no_automatic_bank_submission = true
    and live_delivery_enabled = false
    and bank_workflow_unchanged = true
    and offer_workflow_unchanged = true
    and grant_workflow_unchanged = true
  )
);

alter table public.transaction_bond_originator_workspace_assignments
  add column if not exists one_originator_pilot_id uuid references public.transaction_bond_originator_one_originator_pilots(id) on delete set null;

create unique index if not exists transaction_bond_originator_one_originator_pilots_single_active_idx
  on public.transaction_bond_originator_one_originator_pilots ((true))
  where status in ('ready', 'active');

create unique index if not exists transaction_bond_originator_one_originator_pilots_idempotency_idx
  on public.transaction_bond_originator_one_originator_pilots (idempotency_key)
  where idempotency_key is not null;

create index if not exists transaction_bond_originator_one_originator_pilots_originator_idx
  on public.transaction_bond_originator_one_originator_pilots (pilot_originator_profile_id, status, started_at desc)
  where pilot_originator_profile_id is not null;

create index if not exists transaction_bond_originator_workspace_assignments_r6_pilot_idx
  on public.transaction_bond_originator_workspace_assignments (one_originator_pilot_id, status, assigned_at desc)
  where one_originator_pilot_id is not null;

alter table public.transaction_bond_originator_one_originator_pilots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_one_originator_pilots'
      and policyname = 'bond_originator_one_originator_pilots_service_write'
  ) then
    create policy bond_originator_one_originator_pilots_service_write
      on public.transaction_bond_originator_one_originator_pilots
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_one_originator_pilots'
      and policyname = 'bond_originator_one_originator_pilots_assigned_read'
  ) then
    create policy bond_originator_one_originator_pilots_assigned_read
      on public.transaction_bond_originator_one_originator_pilots
      for select
      using (
        auth.uid() = pilot_originator_profile_id
        or exists (
          select 1
          from public.transaction_bond_originator_workspace_assignments assignment
          where assignment.one_originator_pilot_id = transaction_bond_originator_one_originator_pilots.id
            and public.bridge_can_access_transaction_spine(assignment.transaction_id)
        )
      );
  end if;
end $$;

create or replace function public.bridge_touch_bond_originator_one_originator_pilot()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_bond_originator_one_originator_pilot on public.transaction_bond_originator_one_originator_pilots;
create trigger trg_touch_bond_originator_one_originator_pilot
  before update on public.transaction_bond_originator_one_originator_pilots
  for each row execute function public.bridge_touch_bond_originator_one_originator_pilot();

create or replace function public.bridge_start_bond_originator_one_originator_pilot(
  p_pilot_originator_profile_id uuid,
  p_readiness_report_id uuid,
  p_export_package_ids jsonb,
  p_started_by uuid default auth.uid(),
  p_pilot_originator_name text default null,
  p_pilot_originator_email_reference text default null,
  p_support_owner text default null,
  p_rollback_owner text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  readiness_record public.transaction_bond_originator_internal_readiness_reports%rowtype;
  existing_pilot_id uuid;
  pilot_id uuid;
  package_count integer;
  invalid_package_count integer;
  second_originator_count integer;
begin
  if auth.role() <> 'service_role' and p_started_by is distinct from auth.uid() then
    raise exception 'Pilot start must use the authenticated internal user';
  end if;

  if p_pilot_originator_profile_id is null and coalesce(trim(p_pilot_originator_email_reference), '') = '' then
    raise exception 'One pilot originator is required';
  end if;

  if p_idempotency_key is not null then
    select id into existing_pilot_id
    from public.transaction_bond_originator_one_originator_pilots
    where idempotency_key = p_idempotency_key
    limit 1;

    if existing_pilot_id is not null then
      return existing_pilot_id;
    end if;
  end if;

  if exists (
    select 1
    from public.transaction_bond_originator_one_originator_pilots pilot
    where pilot.status in ('ready', 'active')
  ) then
    raise exception 'A one-originator pilot is already ready or active';
  end if;

  select * into readiness_record
  from public.transaction_bond_originator_internal_readiness_reports
  where id = p_readiness_report_id;

  if not found or readiness_record.status <> 'ready' then
    raise exception 'A ready R1 internal readiness report is required';
  end if;

  select count(*) into package_count
  from jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb));

  if package_count = 0 then
    raise exception 'At least one pilot package is required';
  end if;

  select count(*) into invalid_package_count
  from jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb)) package_id
  left join public.transaction_bond_application_export_packages package
    on package.id = package_id::uuid
  where package.id is null
    or package.destination_key <> 'bond_originator_intake'
    or package.status not in ('ready_for_originator', 'accepted_by_originator', 'downloaded')
    or coalesce((package.operational_context_json ->> 'bank_workflow_unchanged')::boolean, true) <> true
    or coalesce((package.operational_context_json ->> 'live_delivery_enabled')::boolean, false) <> false
    or coalesce((package.operational_context_json ->> 'no_automatic_bank_submission')::boolean, true) <> true;

  if invalid_package_count > 0 then
    raise exception 'Every pilot package must be ready for manual originator processing';
  end if;

  select count(distinct assignment.assigned_to_profile_id) into second_originator_count
  from public.transaction_bond_originator_workspace_assignments assignment
  join jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb)) package_id
    on assignment.export_package_id = package_id::uuid
  where assignment.status in ('assigned', 'accepted')
    and assignment.assigned_to_profile_id is not null
    and assignment.assigned_to_profile_id is distinct from p_pilot_originator_profile_id;

  if second_originator_count > 0 then
    raise exception 'The R6 pilot supports one active bond originator only';
  end if;

  insert into public.transaction_bond_originator_one_originator_pilots (
    pilot_version,
    status,
    pilot_originator_profile_id,
    pilot_originator_email_reference,
    pilot_originator_name,
    maximum_active_originators,
    readiness_report_id,
    governance_report_id,
    pilot_package_ids_json,
    pilot_controls_json,
    pilot_report_json,
    started_by,
    started_at,
    idempotency_key,
    sensitive_payload_included,
    no_automatic_bank_submission,
    live_delivery_enabled,
    bank_workflow_unchanged,
    offer_workflow_unchanged,
    grant_workflow_unchanged,
    metadata
  )
  values (
    'phase-r6-one-originator-pilot-v1',
    'active',
    p_pilot_originator_profile_id,
    nullif(trim(p_pilot_originator_email_reference), ''),
    nullif(trim(p_pilot_originator_name), ''),
    1,
    p_readiness_report_id,
    readiness_record.governance_report_id,
    coalesce(p_export_package_ids, '[]'::jsonb),
    jsonb_build_object(
      'support_owner', p_support_owner,
      'rollback_owner', p_rollback_owner,
      'maximum_active_originators', 1,
      'manual_download_only', true,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false
    ),
    jsonb_build_object(
      'pilotVersion', 'phase-r6-one-originator-pilot-v1',
      'status', 'active',
      'maximumActiveOriginators', 1,
      'arch9FacilitatesOnly', true,
      'originatorProcessesExternally', true,
      'sensitivePayloadIncluded', false,
      'noAutomaticBankSubmission', true,
      'liveDeliveryEnabled', false,
      'bankWorkflowUnchanged', true
    ),
    p_started_by,
    now(),
    p_idempotency_key,
    false,
    true,
    false,
    true,
    true,
    true,
    jsonb_build_object(
      'facilitation_only', true,
      'one_originator_only', true,
      'creates_bank_application', false,
      'bank_workflow_unchanged', true,
      'offer_workflow_unchanged', true,
      'grant_workflow_unchanged', true
    )
  )
  returning id into pilot_id;

  update public.transaction_bond_originator_workspace_assignments assignment
  set one_originator_pilot_id = pilot_id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'one_originator_pilot_id', pilot_id,
        'phase', 'R6',
        'manual_download_only', true,
        'no_automatic_bank_submission', true,
        'bank_workflow_unchanged', true
      )
  from jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb)) package_id
  where assignment.export_package_id = package_id::uuid
    and (
      assignment.assigned_to_profile_id = p_pilot_originator_profile_id
      or auth.role() = 'service_role'
    )
    and assignment.status in ('assigned', 'accepted');

  return pilot_id;
end;
$$;

create or replace function public.bridge_pause_bond_originator_one_originator_pilot(
  p_pilot_id uuid,
  p_paused_by uuid default auth.uid(),
  p_pause_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and p_paused_by is distinct from auth.uid() then
    raise exception 'Pilot pause must use the authenticated internal user';
  end if;

  update public.transaction_bond_originator_one_originator_pilots
  set status = 'paused',
      paused_by = p_paused_by,
      paused_at = coalesce(paused_at, now()),
      pause_reason = nullif(trim(p_pause_reason), ''),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'paused', true,
        'future_assignments_paused', true,
        'preserve_audit_history', true,
        'bank_workflow_unchanged', true
      )
  where id = p_pilot_id
    and status in ('ready', 'active');

  if not found then
    raise exception 'Active one-originator pilot not found';
  end if;

  return p_pilot_id;
end;
$$;

create or replace function public.bridge_bond_originator_one_originator_pilot_view(
  p_pilot_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pilot public.transaction_bond_originator_one_originator_pilots%rowtype;
  v_packages jsonb;
begin
  select * into v_pilot
  from public.transaction_bond_originator_one_originator_pilots
  where id = p_pilot_id;

  if not found then
    return null;
  end if;

  if auth.role() <> 'service_role'
    and auth.uid() is distinct from v_pilot.pilot_originator_profile_id
    and not exists (
      select 1
      from public.transaction_bond_originator_workspace_assignments assignment
      where assignment.one_originator_pilot_id = v_pilot.id
        and public.bridge_can_access_transaction_spine(assignment.transaction_id)
    )
  then
    raise exception 'You do not have access to this pilot.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'exportPackageId', package.id,
      'transactionId', package.transaction_id,
      'status', package.status,
      'assignmentStatus', assignment.status,
      'assignedAt', assignment.assigned_at,
      'acceptedAt', assignment.accepted_at,
      'downloadCount', package.download_count,
      'lastDownloadedAt', package.last_downloaded_at,
      'bankWorkflowUnchanged', true,
      'offerWorkflowUnchanged', true,
      'grantWorkflowUnchanged', true
    )
    order by package.package_ready_at desc nulls last, package.created_at desc
  ), '[]'::jsonb)
  into v_packages
  from public.transaction_bond_originator_workspace_assignments assignment
  join public.transaction_bond_application_export_packages package
    on package.id = assignment.export_package_id
  where assignment.one_originator_pilot_id = v_pilot.id;

  return jsonb_build_object(
    'available', true,
    'pilotVersion', 'phase-r6-one-originator-pilot-v1',
    'id', v_pilot.id,
    'status', v_pilot.status,
    'originator', jsonb_build_object(
      'profileId', v_pilot.pilot_originator_profile_id,
      'name', v_pilot.pilot_originator_name,
      'emailReference', v_pilot.pilot_originator_email_reference
    ),
    'scope', jsonb_build_object(
      'maximumActiveOriginators', 1,
      'packageCount', jsonb_array_length(v_packages)
    ),
    'packages', v_packages,
    'startedAt', v_pilot.started_at,
    'pausedAt', v_pilot.paused_at,
    'completedAt', v_pilot.completed_at,
    'actions', jsonb_build_object(
      'canAddSecondOriginator', false,
      'canLiveDeliver', false,
      'canAutoSubmitToBank', false,
      'canMutateBankWorkflow', false
    ),
    'workflowBoundary', jsonb_build_object(
      'arch9FacilitatesOnly', true,
      'originatorProcessesExternally', true,
      'maximumActiveOriginators', 1,
      'sensitivePayloadIncluded', false,
      'noAutomaticBankSubmission', true,
      'liveDeliveryEnabled', false,
      'bankWorkflowUnchanged', true,
      'offerWorkflowUnchanged', true,
      'grantWorkflowUnchanged', true
    )
  );
end;
$$;

revoke all on function public.bridge_start_bond_originator_one_originator_pilot(uuid, uuid, jsonb, uuid, text, text, text, text, text) from public;
grant execute on function public.bridge_start_bond_originator_one_originator_pilot(uuid, uuid, jsonb, uuid, text, text, text, text, text) to authenticated;

revoke all on function public.bridge_pause_bond_originator_one_originator_pilot(uuid, uuid, text) from public;
grant execute on function public.bridge_pause_bond_originator_one_originator_pilot(uuid, uuid, text) to authenticated;

revoke all on function public.bridge_bond_originator_one_originator_pilot_view(uuid) from public;
grant execute on function public.bridge_bond_originator_one_originator_pilot_view(uuid) to authenticated;

comment on table public.transaction_bond_originator_one_originator_pilots is
  'Phase R6 controlled pilot with one bond originator. It links existing originator workspace assignments for monitored manual processing and does not enable live OOBA delivery, automatic bank submission or bank workflow mutation.';
comment on column public.transaction_bond_originator_one_originator_pilots.pilot_report_json is
  'Metadata-only pilot report. Do not store export payload bodies, raw tokens, public document URLs, credentials, bank payloads or applicant financial answers here.';
comment on function public.bridge_start_bond_originator_one_originator_pilot(uuid, uuid, jsonb, uuid, text, text, text, text, text) is
  'Phase R6 starts a one-originator pilot after R1 readiness. The function enforces maximum_active_originators = 1, manual download only, no automatic bank submission, no live delivery and bank_workflow_unchanged = true.';
comment on function public.bridge_pause_bond_originator_one_originator_pilot(uuid, uuid, text) is
  'Phase R6 pauses a one-originator pilot while preserving audit history and without mutating package, bank, offer or grant workflow state.';
comment on function public.bridge_bond_originator_one_originator_pilot_view(uuid) is
  'Phase R6 metadata-only pilot view for authorized users. It excludes payload bodies, raw tokens, public document URLs and credentials.';
