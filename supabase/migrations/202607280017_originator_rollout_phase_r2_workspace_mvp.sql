create table if not exists public.transaction_bond_originator_workspace_assignments (
  id uuid primary key default gen_random_uuid(),
  export_package_id uuid not null references public.transaction_bond_application_export_packages(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  assigned_to_profile_id uuid references public.profiles(id) on delete set null,
  assigned_to_email_reference text,
  status text not null default 'assigned',
  workspace_version text not null default 'phase-r2-originator-workspace-mvp-v1',
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  completed_at timestamptz,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_bond_originator_workspace_assignments_status_check check (
    status in ('assigned', 'accepted', 'revoked', 'completed')
  ),
  constraint transaction_bond_originator_workspace_assignments_boundary_check check (
    workspace_version = 'phase-r2-originator-workspace-mvp-v1'
  )
);

create unique index if not exists transaction_bond_originator_workspace_assignments_idempotency_idx
  on public.transaction_bond_originator_workspace_assignments (export_package_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists transaction_bond_originator_workspace_assignments_active_profile_idx
  on public.transaction_bond_originator_workspace_assignments (export_package_id, assigned_to_profile_id)
  where assigned_to_profile_id is not null and status in ('assigned', 'accepted');

create index if not exists transaction_bond_originator_workspace_assignments_profile_idx
  on public.transaction_bond_originator_workspace_assignments (assigned_to_profile_id, status, assigned_at desc)
  where assigned_to_profile_id is not null;

create index if not exists transaction_bond_originator_workspace_assignments_transaction_idx
  on public.transaction_bond_originator_workspace_assignments (transaction_id, status, assigned_at desc);

alter table public.transaction_bond_originator_workspace_assignments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_workspace_assignments'
      and policyname = 'bond_originator_workspace_assignments_service_write'
  ) then
    create policy bond_originator_workspace_assignments_service_write
      on public.transaction_bond_originator_workspace_assignments
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'transaction_bond_originator_workspace_assignments'
      and policyname = 'bond_originator_workspace_assignments_assigned_read'
  ) then
    create policy bond_originator_workspace_assignments_assigned_read
      on public.transaction_bond_originator_workspace_assignments
      for select
      using (
        auth.uid() = assigned_to_profile_id
        or public.bridge_can_access_transaction_spine(transaction_id)
      );
  end if;
end $$;

create or replace function public.bridge_touch_bond_originator_workspace_assignment()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_bond_originator_workspace_assignment on public.transaction_bond_originator_workspace_assignments;
create trigger trg_touch_bond_originator_workspace_assignment
  before update on public.transaction_bond_originator_workspace_assignments
  for each row execute function public.bridge_touch_bond_originator_workspace_assignment();

create or replace function public.bridge_accept_bond_originator_workspace_package(
  p_export_package_id uuid,
  p_originator_profile_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_record public.transaction_bond_originator_workspace_assignments%rowtype;
  package_record public.transaction_bond_application_export_packages%rowtype;
begin
  if auth.role() <> 'service_role' and p_originator_profile_id is distinct from auth.uid() then
    raise exception 'Originator workspace package acceptance must use the authenticated originator profile';
  end if;

  select * into assignment_record
  from public.transaction_bond_originator_workspace_assignments
  where export_package_id = p_export_package_id
    and assigned_to_profile_id = p_originator_profile_id
    and status in ('assigned', 'accepted')
  order by assigned_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Assigned originator workspace package not found';
  end if;

  select * into package_record
  from public.transaction_bond_application_export_packages
  where id = p_export_package_id
  for update;

  if not found then
    raise exception 'Bond originator intake package not found';
  end if;

  if package_record.destination_key <> 'bond_originator_intake' then
    raise exception 'Export package is not a bond originator intake package';
  end if;

  if package_record.status not in ('ready_for_originator', 'accepted_by_originator', 'downloaded') then
    raise exception 'Bond originator package is not ready for workspace acceptance';
  end if;

  update public.transaction_bond_originator_workspace_assignments
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now()),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'sensitive_payload_included', false,
        'no_automatic_bank_submission', true,
        'live_delivery_enabled', false,
        'bank_workflow_unchanged', true
      )
  where id = assignment_record.id;

  if package_record.status = 'ready_for_originator' then
    update public.transaction_bond_application_export_packages
    set status = 'accepted_by_originator',
        accepted_by = p_originator_profile_id,
        accepted_at = now(),
        operational_context_json = coalesce(operational_context_json, '{}'::jsonb) || jsonb_build_object(
          'originator_workspace_accepted', true,
          'no_automatic_bank_submission', true,
          'live_delivery_enabled', false,
          'bank_workflow_unchanged', true
        )
    where id = p_export_package_id;
  end if;

  return assignment_record.id;
end;
$$;

create or replace function public.bridge_bond_originator_workspace_mvp_view(
  p_originator_profile_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_packages jsonb;
begin
  if auth.role() <> 'service_role' and p_originator_profile_id is distinct from auth.uid() then
    raise exception 'Originator workspace view must use the authenticated originator profile';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'workspaceVersion', 'phase-r2-originator-workspace-mvp-v1',
      'assignmentId', assignment.id,
      'assignmentStatus', assignment.status,
      'assignedAt', assignment.assigned_at,
      'assignmentAcceptedAt', assignment.accepted_at,
      'id', package.id,
      'transactionId', package.transaction_id,
      'bondApplicationId', package.bond_application_id,
      'submissionId', package.submission_id,
      'destinationKey', package.destination_key,
      'destinationType', package.destination_type,
      'status', package.status,
      'recipientName', coalesce(package.originator_recipient_name, 'Bond originator'),
      'packageReadyAt', package.package_ready_at,
      'acceptedAt', package.accepted_at,
      'downloadCount', package.download_count,
      'lastDownloadedAt', package.last_downloaded_at,
      'documentCounts', jsonb_build_object(
        'signedApplicationDocuments', coalesce((package.document_bundle_manifest_json ->> 'packageDocumentCount')::integer, 0),
        'supportingDocuments', coalesce(jsonb_array_length(coalesce(package.document_bundle_manifest_json -> 'supportingDocuments', '[]'::jsonb)), 0),
        'participantDocuments', coalesce((package.document_bundle_manifest_json ->> 'participantDocumentCount')::integer, 0),
        'sharedDocuments', coalesce((package.document_bundle_manifest_json ->> 'sharedDocumentCount')::integer, 0),
        'total', coalesce((package.document_bundle_manifest_json ->> 'totalDocumentCount')::integer, 0)
      ),
      'documentRequestSummary', jsonb_build_object(
        'total', (
          select count(*)
          from public.transaction_bond_originator_document_requests request
          where request.export_package_id = package.id
        ),
        'open', (
          select count(*)
          from public.transaction_bond_originator_document_requests request
          where request.export_package_id = package.id
            and request.status in ('sent', 'viewed', 'in_progress', 'awaiting_review', 'rejected', 'needs_more_information')
        ),
        'awaitingReview', (
          select count(*)
          from public.transaction_bond_originator_document_requests request
          where request.export_package_id = package.id
            and request.status = 'awaiting_review'
        ),
        'accepted', (
          select count(*)
          from public.transaction_bond_originator_document_requests request
          where request.export_package_id = package.id
            and request.status = 'accepted'
        )
      ),
      'progressSummary', (
        select coalesce(jsonb_build_object(
          'totalEvents', count(*),
          'lastUpdatedAt', max(event.occurred_at),
          'currentStatus', (array_agg(event.status order by event.occurred_at desc, event.created_at desc))[1],
          'currentLabel', (array_agg(event.title order by event.occurred_at desc, event.created_at desc))[1],
          'bankWorkflowUnchanged', true
        ), jsonb_build_object('totalEvents', 0, 'bankWorkflowUnchanged', true))
        from public.transaction_bond_originator_progress_events event
        where event.export_package_id = package.id
          and event.visible_to_originator = true
      ),
      'offerGrantSummary', jsonb_build_object(
        'offerCount', (
          select count(*)
          from public.transaction_bond_originator_bank_offer_captures offer_capture
          where offer_capture.export_package_id = package.id
        ),
        'grantCount', (
          select count(*)
          from public.transaction_bond_originator_grant_captures grant_capture
          where grant_capture.export_package_id = package.id
        ),
        'bankWorkflowUnchanged', true
      ),
      'actions', jsonb_build_object(
        'canAccept', package.status = 'ready_for_originator',
        'canDownload', package.status in ('accepted_by_originator', 'downloaded'),
        'canRequestDocuments', package.status in ('accepted_by_originator', 'downloaded'),
        'canRecordProgress', package.status in ('ready_for_originator', 'accepted_by_originator', 'downloaded'),
        'canCaptureOffersAndGrants', package.status in ('accepted_by_originator', 'downloaded'),
        'canLiveDeliver', false,
        'canMutateBankWorkflow', false,
        'canAutoSubmitToBank', false
      ),
      'workflowBoundary', jsonb_build_object(
        'arch9FacilitatesOnly', true,
        'originatorProcessesExternally', true,
        'sensitive_payload_included', false,
        'no_automatic_bank_submission', true,
        'live_delivery_enabled', false,
        'bank_workflow_unchanged', true,
        'offer_workflow_unchanged', true,
        'grant_workflow_unchanged', true
      )
    )
    order by package.package_ready_at desc nulls last, package.created_at desc
  ), '[]'::jsonb) into v_packages
  from public.transaction_bond_originator_workspace_assignments assignment
  join public.transaction_bond_application_export_packages package
    on package.id = assignment.export_package_id
  where assignment.assigned_to_profile_id = p_originator_profile_id
    and assignment.status in ('assigned', 'accepted')
    and package.destination_key = 'bond_originator_intake'
    and package.status not in ('cancelled', 'superseded');

  return jsonb_build_object(
    'available', true,
    'workspaceVersion', 'phase-r2-originator-workspace-mvp-v1',
    'packageCount', jsonb_array_length(v_packages),
    'packages', v_packages,
    'actions', jsonb_build_object(
      'canLiveDeliver', false,
      'canMutateBankWorkflow', false,
      'canAutoSubmitToBank', false
    )
  );
end;
$$;

revoke all on function public.bridge_accept_bond_originator_workspace_package(uuid, uuid) from public;
grant execute on function public.bridge_accept_bond_originator_workspace_package(uuid, uuid) to authenticated;

revoke all on function public.bridge_bond_originator_workspace_mvp_view(uuid) from public;
grant execute on function public.bridge_bond_originator_workspace_mvp_view(uuid) to authenticated;

comment on table public.transaction_bond_originator_workspace_assignments is
  'Phase R2 assignment table for the originator workspace MVP. It grants assigned originator users access to metadata-only intake package worklists and does not enable live OOBA delivery or bank submission.';
comment on column public.transaction_bond_originator_workspace_assignments.metadata is
  'Operational assignment metadata only. Do not store application payloads, document URLs, tokens, credentials, internal bank payloads or applicant financial values here.';
comment on function public.bridge_bond_originator_workspace_mvp_view(uuid) is
  'Phase R2 metadata-only originator workspace view. It returns assigned intake-package status, document-request counts, progress summaries and offer/grant capture counts without exposing payload bodies, public URLs, tokens or bank workflow mutation controls. Safety flags: sensitive_payload_included = false, no_automatic_bank_submission = true, live_delivery_enabled = false, bank_workflow_unchanged = true.';
comment on function public.bridge_accept_bond_originator_workspace_package(uuid, uuid) is
  'Phase R2 originator workspace package acceptance. Acceptance marks the Arch9 intake package as accepted by an assigned originator user without mutating bank workflow, offers or grants.';
