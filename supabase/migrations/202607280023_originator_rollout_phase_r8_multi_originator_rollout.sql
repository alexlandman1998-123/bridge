create table if not exists public.transaction_bond_originator_multi_originator_rollouts (
  id uuid primary key default gen_random_uuid(),
  rollout_version text not null default 'phase-r8-multi-originator-rollout-v1',
  status text not null default 'draft',
  maximum_active_originators integer not null default 3 check (maximum_active_originators between 2 and 5),
  hardening_report_id uuid references public.transaction_bond_originator_operational_hardening_reports(id) on delete set null,
  approved_originators_json jsonb not null default '[]'::jsonb,
  rollout_package_ids_json jsonb not null default '[]'::jsonb,
  rollout_controls_json jsonb not null default '{}'::jsonb,
  rollout_report_json jsonb not null default '{}'::jsonb,
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
  constraint transaction_bond_originator_multi_originator_rollouts_version_check check (
    rollout_version = 'phase-r8-multi-originator-rollout-v1'
  ),
  constraint transaction_bond_originator_multi_originator_rollouts_status_check check (
    status in ('draft', 'ready', 'active', 'paused', 'completed', 'blocked')
  ),
  constraint transaction_bond_originator_multi_originator_rollouts_originators_check check (
    jsonb_typeof(approved_originators_json) = 'array'
    and jsonb_array_length(approved_originators_json) >= 2
  ),
  constraint transaction_bond_originator_multi_originator_rollouts_packages_check check (
    jsonb_typeof(rollout_package_ids_json) = 'array'
    and jsonb_array_length(rollout_package_ids_json) >= 1
  ),
  constraint transaction_bond_originator_multi_originator_rollouts_boundary_check check (
    sensitive_payload_included = false
    and no_automatic_bank_submission = true
    and live_delivery_enabled = false
    and bank_workflow_unchanged = true
    and offer_workflow_unchanged = true
    and grant_workflow_unchanged = true
  )
);

alter table public.transaction_bond_originator_workspace_assignments
  add column if not exists multi_originator_rollout_id uuid references public.transaction_bond_originator_multi_originator_rollouts(id) on delete set null;

create unique index if not exists transaction_bond_originator_multi_originator_rollouts_single_active_idx
  on public.transaction_bond_originator_multi_originator_rollouts ((true))
  where status in ('ready', 'active');

create unique index if not exists transaction_bond_originator_multi_originator_rollouts_idempotency_idx
  on public.transaction_bond_originator_multi_originator_rollouts (idempotency_key)
  where idempotency_key is not null;

create index if not exists transaction_bond_originator_multi_originator_rollouts_status_idx
  on public.transaction_bond_originator_multi_originator_rollouts (status, started_at desc);

create index if not exists transaction_bond_originator_workspace_assignments_r8_rollout_idx
  on public.transaction_bond_originator_workspace_assignments (multi_originator_rollout_id, assigned_to_profile_id, status, assigned_at desc)
  where multi_originator_rollout_id is not null;

alter table public.transaction_bond_originator_multi_originator_rollouts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_multi_originator_rollouts'
      and policyname = 'bond_originator_multi_originator_rollouts_service_write'
  ) then
    create policy bond_originator_multi_originator_rollouts_service_write
      on public.transaction_bond_originator_multi_originator_rollouts
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_multi_originator_rollouts'
      and policyname = 'bond_originator_multi_originator_rollouts_assigned_read'
  ) then
    create policy bond_originator_multi_originator_rollouts_assigned_read
      on public.transaction_bond_originator_multi_originator_rollouts
      for select
      using (
        exists (
          select 1
          from public.transaction_bond_originator_workspace_assignments assignment
          where assignment.multi_originator_rollout_id = transaction_bond_originator_multi_originator_rollouts.id
            and (
              assignment.assigned_to_profile_id = auth.uid()
              or public.bridge_can_access_transaction_spine(assignment.transaction_id)
            )
        )
      );
  end if;
end $$;

create or replace function public.bridge_touch_bond_originator_multi_originator_rollout()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_bond_originator_multi_originator_rollout on public.transaction_bond_originator_multi_originator_rollouts;
create trigger trg_touch_bond_originator_multi_originator_rollout
  before update on public.transaction_bond_originator_multi_originator_rollouts
  for each row execute function public.bridge_touch_bond_originator_multi_originator_rollout();

create or replace function public.bridge_start_bond_originator_multi_originator_rollout(
  p_hardening_report_id uuid,
  p_approved_originator_profile_ids jsonb,
  p_export_package_ids jsonb,
  p_started_by uuid default auth.uid(),
  p_maximum_active_originators integer default 3,
  p_support_owner text default null,
  p_escalation_owner text default null,
  p_rollback_owner text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hardening_record public.transaction_bond_originator_operational_hardening_reports%rowtype;
  existing_rollout_id uuid;
  rollout_id uuid;
  originator_count integer;
  package_count integer;
  invalid_package_count integer;
  unassigned_package_count integer;
  outside_cohort_count integer;
  safe_maximum integer;
begin
  if auth.role() <> 'service_role' and p_started_by is distinct from auth.uid() then
    raise exception 'Multi-originator rollout start must use the authenticated internal user';
  end if;

  safe_maximum := least(5, greatest(2, coalesce(p_maximum_active_originators, 3)));

  if p_idempotency_key is not null then
    select id into existing_rollout_id
    from public.transaction_bond_originator_multi_originator_rollouts
    where idempotency_key = p_idempotency_key
    limit 1;

    if existing_rollout_id is not null then
      return existing_rollout_id;
    end if;
  end if;

  if exists (
    select 1
    from public.transaction_bond_originator_multi_originator_rollouts rollout
    where rollout.status in ('ready', 'active')
  ) then
    raise exception 'A multi-originator rollout is already ready or active';
  end if;

  select * into hardening_record
  from public.transaction_bond_originator_operational_hardening_reports
  where id = p_hardening_report_id;

  if not found or hardening_record.status <> 'healthy' then
    raise exception 'A healthy R7 operational hardening report is required';
  end if;

  select count(distinct originator_id::uuid) into originator_count
  from jsonb_array_elements_text(coalesce(p_approved_originator_profile_ids, '[]'::jsonb)) originator_id;

  if originator_count < 2 or originator_count > safe_maximum then
    raise exception 'R8 requires at least two approved originators and no more than the configured maximum_active_originators';
  end if;

  select count(*) into package_count
  from jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb));

  if package_count = 0 then
    raise exception 'At least one rollout package is required';
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
    raise exception 'Every R8 rollout package must be ready for manual originator processing';
  end if;

  select count(*) into unassigned_package_count
  from jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb)) package_id
  left join public.transaction_bond_originator_workspace_assignments assignment
    on assignment.export_package_id = package_id::uuid
   and assignment.status in ('assigned', 'accepted')
  where assignment.id is null;

  if unassigned_package_count > 0 then
    raise exception 'Every R8 rollout package must have an active originator workspace assignment';
  end if;

  select count(*) into outside_cohort_count
  from jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb)) package_id
  join public.transaction_bond_originator_workspace_assignments assignment
    on assignment.export_package_id = package_id::uuid
   and assignment.status in ('assigned', 'accepted')
  where assignment.assigned_to_profile_id not in (
    select originator_id::uuid
    from jsonb_array_elements_text(coalesce(p_approved_originator_profile_ids, '[]'::jsonb)) originator_id
  );

  if outside_cohort_count > 0 then
    raise exception 'R8 rollout packages must be assigned only to approved cohort originators';
  end if;

  if coalesce(trim(p_support_owner), '') = ''
    or coalesce(trim(p_escalation_owner), '') = ''
    or coalesce(trim(p_rollback_owner), '') = ''
  then
    raise exception 'Support, escalation and rollback owners are required';
  end if;

  insert into public.transaction_bond_originator_multi_originator_rollouts (
    rollout_version,
    status,
    maximum_active_originators,
    hardening_report_id,
    approved_originators_json,
    rollout_package_ids_json,
    rollout_controls_json,
    rollout_report_json,
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
    'phase-r8-multi-originator-rollout-v1',
    'active',
    safe_maximum,
    p_hardening_report_id,
    coalesce(p_approved_originator_profile_ids, '[]'::jsonb),
    coalesce(p_export_package_ids, '[]'::jsonb),
    jsonb_build_object(
      'support_owner', p_support_owner,
      'escalation_owner', p_escalation_owner,
      'rollback_owner', p_rollback_owner,
      'maximum_active_originators', safe_maximum,
      'manual_download_only', true,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false
    ),
    jsonb_build_object(
      'rolloutVersion', 'phase-r8-multi-originator-rollout-v1',
      'status', 'active',
      'originatorCount', originator_count,
      'packageCount', package_count,
      'maximumActiveOriginators', safe_maximum,
      'manualDownloadOnly', true,
      'facilitationOnly', true,
      'noAutomaticBankSubmission', true,
      'liveDeliveryEnabled', false,
      'bankWorkflowUnchanged', true,
      'offerWorkflowUnchanged', true,
      'grantWorkflowUnchanged', true
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
      'phase', 'R8',
      'multi_originator_rollout', true,
      'manual_download_only', true,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false,
      'bank_workflow_unchanged', true,
      'offer_workflow_unchanged', true,
      'grant_workflow_unchanged', true
    )
  )
  returning id into rollout_id;

  update public.transaction_bond_originator_workspace_assignments assignment
  set multi_originator_rollout_id = rollout_id,
      metadata = coalesce(assignment.metadata, '{}'::jsonb) || jsonb_build_object(
        'phase_r8_multi_originator_rollout_id', rollout_id,
        'manual_download_only', true,
        'no_automatic_bank_submission', true,
        'live_delivery_enabled', false,
        'bank_workflow_unchanged', true
      )
  where assignment.export_package_id in (
    select package_id::uuid
    from jsonb_array_elements_text(coalesce(p_export_package_ids, '[]'::jsonb)) package_id
  )
    and assignment.status in ('assigned', 'accepted');

  return rollout_id;
end;
$$;

create or replace function public.bridge_pause_bond_originator_multi_originator_rollout(
  p_rollout_id uuid,
  p_paused_by uuid default auth.uid(),
  p_pause_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  paused_rollout_id uuid;
begin
  if auth.role() <> 'service_role' and p_paused_by is distinct from auth.uid() then
    raise exception 'Multi-originator rollout pause must use the authenticated internal user';
  end if;

  update public.transaction_bond_originator_multi_originator_rollouts
  set status = 'paused',
      paused_by = p_paused_by,
      paused_at = now(),
      pause_reason = nullif(trim(p_pause_reason), ''),
      metadata = metadata || jsonb_build_object(
        'paused_without_bank_workflow_mutation', true,
        'future_assignments_only', true
      )
  where id = p_rollout_id
    and status in ('ready', 'active')
  returning id into paused_rollout_id;

  if paused_rollout_id is null then
    raise exception 'Active or ready multi-originator rollout not found';
  end if;

  return paused_rollout_id;
end;
$$;

create or replace function public.bridge_bond_originator_multi_originator_rollout_view(p_rollout_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rollout_record public.transaction_bond_originator_multi_originator_rollouts%rowtype;
  package_summary jsonb;
begin
  select * into rollout_record
  from public.transaction_bond_originator_multi_originator_rollouts
  where id = p_rollout_id;

  if not found then
    raise exception 'R8 multi-originator rollout not found';
  end if;

  if auth.role() <> 'service_role'
    and not exists (
      select 1
      from public.transaction_bond_originator_workspace_assignments assignment
      where assignment.multi_originator_rollout_id = p_rollout_id
        and (
          assignment.assigned_to_profile_id = auth.uid()
          or public.bridge_can_access_transaction_spine(assignment.transaction_id)
        )
    )
  then
    raise exception 'Not authorized to view multi-originator rollout';
  end if;

  select jsonb_build_object(
    'packageCount', count(*),
    'originatorCount', count(distinct assignment.assigned_to_profile_id),
    'acceptedCount', count(*) filter (where assignment.status = 'accepted'),
    'assignedCount', count(*) filter (where assignment.status = 'assigned')
  )
  into package_summary
  from public.transaction_bond_originator_workspace_assignments assignment
  where assignment.multi_originator_rollout_id = p_rollout_id;

  return jsonb_build_object(
    'rolloutVersion', 'phase-r8-multi-originator-rollout-v1',
    'rolloutId', rollout_record.id,
    'status', rollout_record.status,
    'maximumActiveOriginators', rollout_record.maximum_active_originators,
    'approvedOriginators', rollout_record.approved_originators_json,
    'packageSummary', coalesce(package_summary, '{}'::jsonb),
    'actions', jsonb_build_object(
      'canPauseRollout', rollout_record.status = 'active',
      'canAddOriginatorOutsideCohort', false,
      'canLiveDeliver', false,
      'canAutoSubmitToBank', false,
      'canMutateBankWorkflow', false
    ),
    'workflowBoundary', jsonb_build_object(
      'arch9FacilitatesOnly', true,
      'originatorProcessesExternally', true,
      'maximumActiveOriginators', rollout_record.maximum_active_originators,
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

comment on table public.transaction_bond_originator_multi_originator_rollouts is
  'Phase R8 controlled multi-originator rollout cohort. This expands manual originator access after R7 hardening without introducing live delivery, automatic bank submission, bank workflow mutation, offer mutation or grant mutation.';

comment on function public.bridge_start_bond_originator_multi_originator_rollout(uuid, jsonb, jsonb, uuid, integer, text, text, text, text) is
  'Starts a Phase R8 multi-originator rollout after healthy R7 hardening. maximum_active_originators is centrally capped; no_automatic_bank_submission = true, live_delivery_enabled = false and bank_workflow_unchanged = true.';

comment on function public.bridge_pause_bond_originator_multi_originator_rollout(uuid, uuid, text) is
  'Pauses a Phase R8 multi-originator rollout while preserving packages, documents and audit history.';

comment on function public.bridge_bond_originator_multi_originator_rollout_view(uuid) is
  'Returns metadata-only Phase R8 multi-originator rollout status. It excludes payloads, tokens, public URLs and document storage paths.';
