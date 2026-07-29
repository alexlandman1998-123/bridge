create table if not exists public.transaction_bond_originator_operational_incidents (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.transaction_bond_originator_one_originator_pilots(id) on delete cascade,
  export_package_id uuid references public.transaction_bond_application_export_packages(id) on delete set null,
  hardening_version text not null default 'phase-r7-operational-hardening-v1',
  severity text not null default 'low',
  status text not null default 'open',
  title text not null,
  summary text not null,
  detected_by uuid references public.profiles(id) on delete set null,
  detected_at timestamptz not null default now(),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
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
  constraint transaction_bond_originator_operational_incidents_version_check check (
    hardening_version = 'phase-r7-operational-hardening-v1'
  ),
  constraint transaction_bond_originator_operational_incidents_severity_check check (
    severity in ('low', 'medium', 'high', 'critical')
  ),
  constraint transaction_bond_originator_operational_incidents_status_check check (
    status in ('open', 'investigating', 'resolved', 'withdrawn')
  ),
  constraint transaction_bond_originator_operational_incidents_title_check check (
    nullif(trim(title), '') is not null
  ),
  constraint transaction_bond_originator_operational_incidents_summary_check check (
    nullif(trim(summary), '') is not null
  ),
  constraint transaction_bond_originator_operational_incidents_boundary_check check (
    sensitive_payload_included = false
    and no_automatic_bank_submission = true
    and live_delivery_enabled = false
    and bank_workflow_unchanged = true
    and offer_workflow_unchanged = true
    and grant_workflow_unchanged = true
  )
);

create table if not exists public.transaction_bond_originator_operational_hardening_reports (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.transaction_bond_originator_one_originator_pilots(id) on delete cascade,
  report_version text not null default 'phase-r7-operational-hardening-v1',
  status text not null default 'blocked',
  hardening_report_json jsonb not null default '{}'::jsonb,
  checklist_json jsonb not null default '[]'::jsonb,
  incident_summary_json jsonb not null default '{}'::jsonb,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
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
  constraint transaction_bond_originator_operational_hardening_reports_version_check check (
    report_version = 'phase-r7-operational-hardening-v1'
  ),
  constraint transaction_bond_originator_operational_hardening_reports_status_check check (
    status in ('healthy', 'attention_required', 'blocked')
  ),
  constraint transaction_bond_originator_operational_hardening_reports_boundary_check check (
    sensitive_payload_included = false
    and no_automatic_bank_submission = true
    and live_delivery_enabled = false
    and bank_workflow_unchanged = true
    and offer_workflow_unchanged = true
    and grant_workflow_unchanged = true
  )
);

create unique index if not exists transaction_bond_originator_operational_incidents_idempotency_idx
  on public.transaction_bond_originator_operational_incidents (pilot_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists transaction_bond_originator_operational_incidents_pilot_status_idx
  on public.transaction_bond_originator_operational_incidents (pilot_id, status, severity, detected_at desc);

create index if not exists transaction_bond_originator_operational_incidents_package_idx
  on public.transaction_bond_originator_operational_incidents (export_package_id, detected_at desc)
  where export_package_id is not null;

create unique index if not exists transaction_bond_originator_operational_hardening_reports_idempotency_idx
  on public.transaction_bond_originator_operational_hardening_reports (pilot_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists transaction_bond_originator_operational_hardening_reports_pilot_status_idx
  on public.transaction_bond_originator_operational_hardening_reports (pilot_id, status, generated_at desc);

alter table public.transaction_bond_originator_operational_incidents enable row level security;
alter table public.transaction_bond_originator_operational_hardening_reports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_operational_incidents'
      and policyname = 'bond_originator_operational_incidents_service_write'
  ) then
    create policy bond_originator_operational_incidents_service_write
      on public.transaction_bond_originator_operational_incidents
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_operational_incidents'
      and policyname = 'bond_originator_operational_incidents_assigned_read'
  ) then
    create policy bond_originator_operational_incidents_assigned_read
      on public.transaction_bond_originator_operational_incidents
      for select
      using (
        exists (
          select 1
          from public.transaction_bond_originator_one_originator_pilots pilot
          where pilot.id = transaction_bond_originator_operational_incidents.pilot_id
            and (
              auth.uid() = pilot.pilot_originator_profile_id
              or exists (
                select 1
                from public.transaction_bond_originator_workspace_assignments assignment
                where assignment.one_originator_pilot_id = pilot.id
                  and public.bridge_can_access_transaction_spine(assignment.transaction_id)
              )
            )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_operational_hardening_reports'
      and policyname = 'bond_originator_operational_hardening_reports_service_write'
  ) then
    create policy bond_originator_operational_hardening_reports_service_write
      on public.transaction_bond_originator_operational_hardening_reports
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_operational_hardening_reports'
      and policyname = 'bond_originator_operational_hardening_reports_assigned_read'
  ) then
    create policy bond_originator_operational_hardening_reports_assigned_read
      on public.transaction_bond_originator_operational_hardening_reports
      for select
      using (
        exists (
          select 1
          from public.transaction_bond_originator_one_originator_pilots pilot
          where pilot.id = transaction_bond_originator_operational_hardening_reports.pilot_id
            and (
              auth.uid() = pilot.pilot_originator_profile_id
              or exists (
                select 1
                from public.transaction_bond_originator_workspace_assignments assignment
                where assignment.one_originator_pilot_id = pilot.id
                  and public.bridge_can_access_transaction_spine(assignment.transaction_id)
              )
            )
        )
      );
  end if;
end $$;

create or replace function public.bridge_touch_bond_originator_operational_incident()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_bond_originator_operational_incident on public.transaction_bond_originator_operational_incidents;
create trigger trg_touch_bond_originator_operational_incident
  before update on public.transaction_bond_originator_operational_incidents
  for each row execute function public.bridge_touch_bond_originator_operational_incident();

create or replace function public.bridge_touch_bond_originator_operational_hardening_report()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_bond_originator_operational_hardening_report on public.transaction_bond_originator_operational_hardening_reports;
create trigger trg_touch_bond_originator_operational_hardening_report
  before update on public.transaction_bond_originator_operational_hardening_reports
  for each row execute function public.bridge_touch_bond_originator_operational_hardening_report();

create or replace function public.bridge_record_bond_originator_operational_incident(
  p_pilot_id uuid,
  p_severity text,
  p_title text,
  p_summary text,
  p_export_package_id uuid default null,
  p_detected_by uuid default auth.uid(),
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  pilot_record public.transaction_bond_originator_one_originator_pilots%rowtype;
  existing_incident_id uuid;
  incident_id uuid;
begin
  select * into pilot_record
  from public.transaction_bond_originator_one_originator_pilots
  where id = p_pilot_id;

  if not found then
    raise exception 'R7 operational hardening incident requires an existing one-originator pilot';
  end if;

  if auth.role() <> 'service_role'
    and p_detected_by is distinct from auth.uid()
    and auth.uid() is distinct from pilot_record.pilot_originator_profile_id
    and not exists (
      select 1
      from public.transaction_bond_originator_workspace_assignments assignment
      where assignment.one_originator_pilot_id = p_pilot_id
        and public.bridge_can_access_transaction_spine(assignment.transaction_id)
    )
  then
    raise exception 'Not authorized to record operational incident for this pilot';
  end if;

  if p_severity not in ('low', 'medium', 'high', 'critical') then
    raise exception 'Invalid operational incident severity';
  end if;

  if nullif(trim(p_title), '') is null or nullif(trim(p_summary), '') is null then
    raise exception 'Operational incident title and summary are required';
  end if;

  if p_idempotency_key is not null then
    select id into existing_incident_id
    from public.transaction_bond_originator_operational_incidents
    where pilot_id = p_pilot_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if existing_incident_id is not null then
      return existing_incident_id;
    end if;
  end if;

  if p_export_package_id is not null and not exists (
    select 1
    from public.transaction_bond_originator_workspace_assignments assignment
    where assignment.one_originator_pilot_id = p_pilot_id
      and assignment.export_package_id = p_export_package_id
  ) then
    raise exception 'Operational incident package must belong to this pilot';
  end if;

  insert into public.transaction_bond_originator_operational_incidents (
    pilot_id,
    export_package_id,
    hardening_version,
    severity,
    status,
    title,
    summary,
    detected_by,
    detected_at,
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
    p_pilot_id,
    p_export_package_id,
    'phase-r7-operational-hardening-v1',
    p_severity,
    'open',
    trim(p_title),
    trim(p_summary),
    p_detected_by,
    now(),
    p_idempotency_key,
    false,
    true,
    false,
    true,
    true,
    true,
    jsonb_build_object(
      'phase', 'R7',
      'operational_hardening', true,
      'facilitation_only', true,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false,
      'bank_workflow_unchanged', true,
      'offer_workflow_unchanged', true,
      'grant_workflow_unchanged', true
    )
  )
  returning id into incident_id;

  return incident_id;
end;
$$;

create or replace function public.bridge_create_bond_originator_operational_hardening_report(
  p_pilot_id uuid,
  p_status text,
  p_hardening_report_json jsonb default '{}'::jsonb,
  p_checklist_json jsonb default '[]'::jsonb,
  p_generated_by uuid default auth.uid(),
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  pilot_record public.transaction_bond_originator_one_originator_pilots%rowtype;
  existing_report_id uuid;
  report_id uuid;
  open_severe_incident_count integer;
begin
  select * into pilot_record
  from public.transaction_bond_originator_one_originator_pilots
  where id = p_pilot_id;

  if not found then
    raise exception 'R7 operational hardening report requires an existing one-originator pilot';
  end if;

  if auth.role() <> 'service_role'
    and p_generated_by is distinct from auth.uid()
    and auth.uid() is distinct from pilot_record.pilot_originator_profile_id
    and not exists (
      select 1
      from public.transaction_bond_originator_workspace_assignments assignment
      where assignment.one_originator_pilot_id = p_pilot_id
        and public.bridge_can_access_transaction_spine(assignment.transaction_id)
    )
  then
    raise exception 'Not authorized to create operational hardening report for this pilot';
  end if;

  if p_status not in ('healthy', 'attention_required', 'blocked') then
    raise exception 'Invalid operational hardening status';
  end if;

  if p_idempotency_key is not null then
    select id into existing_report_id
    from public.transaction_bond_originator_operational_hardening_reports
    where pilot_id = p_pilot_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if existing_report_id is not null then
      return existing_report_id;
    end if;
  end if;

  select count(*) into open_severe_incident_count
  from public.transaction_bond_originator_operational_incidents incident
  where incident.pilot_id = p_pilot_id
    and incident.status in ('open', 'investigating')
    and incident.severity in ('high', 'critical');

  if p_status = 'healthy' and open_severe_incident_count > 0 then
    raise exception 'Operational hardening cannot be healthy while high-severity incidents are open';
  end if;

  insert into public.transaction_bond_originator_operational_hardening_reports (
    pilot_id,
    report_version,
    status,
    hardening_report_json,
    checklist_json,
    incident_summary_json,
    generated_by,
    generated_at,
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
    p_pilot_id,
    'phase-r7-operational-hardening-v1',
    p_status,
    coalesce(p_hardening_report_json, '{}'::jsonb) || jsonb_build_object(
      'phase', 'R7',
      'hardeningVersion', 'phase-r7-operational-hardening-v1',
      'maximumActiveOriginators', 1,
      'facilitationOnly', true,
      'noAutomaticBankSubmission', true,
      'liveDeliveryEnabled', false,
      'bankWorkflowUnchanged', true,
      'offerWorkflowUnchanged', true,
      'grantWorkflowUnchanged', true
    ),
    coalesce(p_checklist_json, '[]'::jsonb),
    jsonb_build_object(
      'openSevereIncidentCount', open_severe_incident_count,
      'sensitivePayloadIncluded', false
    ),
    p_generated_by,
    now(),
    p_idempotency_key,
    false,
    true,
    false,
    true,
    true,
    true,
    jsonb_build_object(
      'reporting_only', true,
      'maximum_active_originators', 1,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false,
      'bank_workflow_unchanged', true,
      'offer_workflow_unchanged', true,
      'grant_workflow_unchanged', true
    )
  )
  returning id into report_id;

  return report_id;
end;
$$;

create or replace function public.bridge_bond_originator_operational_hardening_view(p_pilot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pilot_record public.transaction_bond_originator_one_originator_pilots%rowtype;
  latest_report public.transaction_bond_originator_operational_hardening_reports%rowtype;
  incident_summary jsonb;
begin
  select * into pilot_record
  from public.transaction_bond_originator_one_originator_pilots
  where id = p_pilot_id;

  if not found then
    raise exception 'R7 operational hardening view requires an existing one-originator pilot';
  end if;

  if auth.role() <> 'service_role'
    and auth.uid() is distinct from pilot_record.pilot_originator_profile_id
    and not exists (
      select 1
      from public.transaction_bond_originator_workspace_assignments assignment
      where assignment.one_originator_pilot_id = p_pilot_id
        and public.bridge_can_access_transaction_spine(assignment.transaction_id)
    )
  then
    raise exception 'Not authorized to view operational hardening for this pilot';
  end if;

  select * into latest_report
  from public.transaction_bond_originator_operational_hardening_reports report
  where report.pilot_id = p_pilot_id
  order by report.generated_at desc
  limit 1;

  select jsonb_build_object(
    'total', count(*),
    'open', count(*) filter (where status in ('open', 'investigating')),
    'openSevere', count(*) filter (where status in ('open', 'investigating') and severity in ('high', 'critical')),
    'lastDetectedAt', max(detected_at)
  )
  into incident_summary
  from public.transaction_bond_originator_operational_incidents incident
  where incident.pilot_id = p_pilot_id;

  return jsonb_build_object(
    'hardeningVersion', 'phase-r7-operational-hardening-v1',
    'pilotId', pilot_record.id,
    'pilotStatus', pilot_record.status,
    'maximumActiveOriginators', 1,
    'latestReportId', latest_report.id,
    'latestReportStatus', latest_report.status,
    'latestReportGeneratedAt', latest_report.generated_at,
    'checklist', coalesce(latest_report.checklist_json, '[]'::jsonb),
    'incidentSummary', coalesce(incident_summary, '{}'::jsonb),
    'actions', jsonb_build_object(
      'canContinuePilot', coalesce(latest_report.status, 'blocked') <> 'blocked',
      'canPausePilot', coalesce(latest_report.status, 'blocked') <> 'healthy',
      'canExpandOriginators', false,
      'canLiveDeliver', false,
      'canAutoSubmitToBank', false,
      'canMutateBankWorkflow', false
    ),
    'workflowBoundary', jsonb_build_object(
      'arch9FacilitatesOnly', true,
      'originatorProcessesExternally', true,
      'maximumActiveOriginators', 1,
      'noAutomaticBankSubmission', true,
      'liveDeliveryEnabled', false,
      'bankWorkflowUnchanged', true,
      'offerWorkflowUnchanged', true,
      'grantWorkflowUnchanged', true
    ),
    'payloadsExcluded', true,
    'tokensExcluded', true,
    'publicDocumentUrlsExcluded', true
  );
end;
$$;

comment on table public.transaction_bond_originator_operational_hardening_reports is
  'Phase R7 operational hardening report. Metadata-only evidence that the one-originator pilot is safe to continue; no live delivery, automatic bank submission, bank workflow mutation, offer mutation or grant mutation is introduced.';

comment on table public.transaction_bond_originator_operational_incidents is
  'Phase R7 operational incident log for the one-originator pilot. Do not store payloads, tokens, public URLs, applicant financial values or external credentials.';

comment on function public.bridge_record_bond_originator_operational_incident(uuid, text, text, text, uuid, uuid, text) is
  'Records a Phase R7 operational incident without storing sensitive payloads or mutating bank workflow.';

comment on function public.bridge_create_bond_originator_operational_hardening_report(uuid, text, jsonb, jsonb, uuid, text) is
  'Creates a Phase R7 operational hardening report with maximum_active_originators = 1, no_automatic_bank_submission = true, live_delivery_enabled = false and bank_workflow_unchanged = true.';

comment on function public.bridge_bond_originator_operational_hardening_view(uuid) is
  'Returns a metadata-only Phase R7 operational hardening view. It excludes payloads, tokens, public URLs and document storage paths.';
