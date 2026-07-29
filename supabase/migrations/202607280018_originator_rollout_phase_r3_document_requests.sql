alter table public.transaction_bond_originator_document_requests
  add column if not exists workspace_version text not null default 'phase-r3-originator-document-requests-v1',
  add column if not exists originator_workspace_assignment_id uuid references public.transaction_bond_originator_workspace_assignments(id) on delete set null,
  add column if not exists request_priority text not null default 'normal',
  add column if not exists last_originator_action_at timestamptz,
  add column if not exists last_participant_action_at timestamptz,
  add column if not exists resolved_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.transaction_bond_originator_document_requests'::regclass
      and conname = 'transaction_bond_originator_document_requests_priority_check'
  ) then
    alter table public.transaction_bond_originator_document_requests
      add constraint transaction_bond_originator_document_requests_priority_check check (
        request_priority in ('normal', 'urgent')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.transaction_bond_originator_document_requests'::regclass
      and conname = 'transaction_bond_originator_document_requests_workspace_boundary_check'
  ) then
    alter table public.transaction_bond_originator_document_requests
      add constraint transaction_bond_originator_document_requests_workspace_boundary_check check (
        workspace_version = 'phase-r3-originator-document-requests-v1'
        and requires_new_submission = false
        and bank_workflow_unchanged = true
      );
  end if;
end $$;

create index if not exists transaction_bond_originator_document_requests_workspace_queue_idx
  on public.transaction_bond_originator_document_requests (export_package_id, status, request_priority, due_at, created_at desc);

create index if not exists transaction_bond_originator_document_requests_workspace_assignment_idx
  on public.transaction_bond_originator_document_requests (originator_workspace_assignment_id, status, created_at desc)
  where originator_workspace_assignment_id is not null;

create or replace function public.bridge_create_bond_originator_workspace_document_request(
  p_export_package_id uuid,
  p_request_type text,
  p_target_scope text,
  p_participant_id uuid default null,
  p_participant_key text default null,
  p_participant_role text default null,
  p_requirement_key text default null,
  p_canonical_document_type text default null,
  p_transaction_required_document_id uuid default null,
  p_title text default null,
  p_buyer_instruction text default null,
  p_internal_note text default null,
  p_due_at timestamptz default null,
  p_request_priority text default 'normal',
  p_originator_profile_id uuid default auth.uid(),
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  package_record public.transaction_bond_application_export_packages%rowtype;
  assignment_record public.transaction_bond_originator_workspace_assignments%rowtype;
  existing_request_id uuid;
  request_id uuid;
begin
  if auth.role() <> 'service_role' and p_originator_profile_id is distinct from auth.uid() then
    raise exception 'Document request creation must use the authenticated originator profile';
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

  if package_record.status not in ('accepted_by_originator', 'downloaded') then
    raise exception 'Originator intake package must be accepted before requesting documents';
  end if;

  select * into assignment_record
  from public.transaction_bond_originator_workspace_assignments assignment
  where assignment.export_package_id = p_export_package_id
    and assignment.assigned_to_profile_id = p_originator_profile_id
    and assignment.status in ('assigned', 'accepted')
  order by assignment.assigned_at desc
  limit 1;

  if not found and auth.role() <> 'service_role' then
    raise exception 'Originator is not assigned to this package';
  end if;

  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_buyer_instruction), '') = '' then
    raise exception 'Document request title and buyer instruction are required';
  end if;

  if coalesce(trim(p_canonical_document_type), '') = ''
    and coalesce(trim(p_requirement_key), '') = ''
    and p_transaction_required_document_id is null then
    raise exception 'A stable document target is required';
  end if;

  if coalesce(p_request_type, 'supplemental_document') not in ('missing_document', 'replacement_document', 'supplemental_document') then
    raise exception 'Unsupported document request type';
  end if;

  if coalesce(p_target_scope, 'participant_documents') not in ('application_documents', 'participant_documents') then
    raise exception 'Unsupported document request target scope';
  end if;

  if coalesce(p_request_priority, 'normal') not in ('normal', 'urgent') then
    raise exception 'Unsupported document request priority';
  end if;

  if p_idempotency_key is not null then
    select id into existing_request_id
    from public.transaction_bond_originator_document_requests
    where export_package_id = p_export_package_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if existing_request_id is not null then
      return existing_request_id;
    end if;
  end if;

  insert into public.transaction_bond_originator_document_requests (
    export_package_id,
    transaction_id,
    bond_application_id,
    submission_id,
    participant_id,
    participant_key,
    participant_role,
    target_scope,
    request_type,
    status,
    requirement_key,
    canonical_document_type,
    transaction_required_document_id,
    requested_by,
    buyer_instruction,
    internal_note,
    due_at,
    sent_at,
    idempotency_key,
    workspace_version,
    originator_workspace_assignment_id,
    request_priority,
    last_originator_action_at,
    requires_new_submission,
    bank_workflow_unchanged,
    metadata
  )
  values (
    p_export_package_id,
    package_record.transaction_id,
    package_record.bond_application_id,
    package_record.submission_id,
    p_participant_id,
    nullif(trim(p_participant_key), ''),
    nullif(trim(p_participant_role), ''),
    coalesce(p_target_scope, 'participant_documents'),
    coalesce(p_request_type, 'supplemental_document'),
    'sent',
    nullif(trim(p_requirement_key), ''),
    nullif(trim(p_canonical_document_type), ''),
    p_transaction_required_document_id,
    p_originator_profile_id,
    trim(p_buyer_instruction),
    nullif(trim(p_internal_note), ''),
    p_due_at,
    now(),
    p_idempotency_key,
    'phase-r3-originator-document-requests-v1',
    assignment_record.id,
    coalesce(p_request_priority, 'normal'),
    now(),
    false,
    true,
    jsonb_build_object(
      'supplemental_only', true,
      'sensitive_payload_included', false,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false,
      'bank_workflow_unchanged', true
    )
  )
  returning id into request_id;

  return request_id;
end;
$$;

create or replace function public.bridge_review_bond_originator_workspace_document_request(
  p_request_id uuid,
  p_action text,
  p_buyer_safe_feedback text default null,
  p_internal_note text default null,
  p_originator_profile_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_record public.transaction_bond_originator_document_requests%rowtype;
  assignment_record public.transaction_bond_originator_workspace_assignments%rowtype;
  next_status text;
begin
  if auth.role() <> 'service_role' and p_originator_profile_id is distinct from auth.uid() then
    raise exception 'Document request review must use the authenticated originator profile';
  end if;

  select * into request_record
  from public.transaction_bond_originator_document_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Bond originator document request not found';
  end if;

  select * into assignment_record
  from public.transaction_bond_originator_workspace_assignments assignment
  where assignment.export_package_id = request_record.export_package_id
    and assignment.assigned_to_profile_id = p_originator_profile_id
    and assignment.status in ('assigned', 'accepted')
  order by assignment.assigned_at desc
  limit 1;

  if not found and auth.role() <> 'service_role' then
    raise exception 'Originator is not assigned to this package';
  end if;

  next_status := case p_action
    when 'accept' then 'accepted'
    when 'reject' then 'rejected'
    when 'more_information' then 'needs_more_information'
    when 'withdraw' then 'withdrawn'
    else null
  end;

  if next_status is null then
    raise exception 'Unsupported document request review action';
  end if;

  if next_status = 'accepted' and request_record.linked_document_id is null then
    raise exception 'A linked document is required before accepting a document request';
  end if;

  update public.transaction_bond_originator_document_requests
  set status = next_status,
      buyer_safe_feedback = coalesce(nullif(trim(p_buyer_safe_feedback), ''), buyer_safe_feedback),
      internal_note = coalesce(nullif(trim(p_internal_note), ''), internal_note),
      reviewed_by = p_originator_profile_id,
      reviewed_at = now(),
      withdrawn_at = case when next_status = 'withdrawn' then now() else withdrawn_at end,
      resolved_at = case when next_status in ('accepted', 'withdrawn') then now() else null end,
      last_originator_action_at = now(),
      requires_new_submission = false,
      bank_workflow_unchanged = true,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'supplemental_only', true,
        'sensitive_payload_included', false,
        'no_automatic_bank_submission', true,
        'live_delivery_enabled', false,
        'bank_workflow_unchanged', true
      )
  where id = p_request_id;

  return p_request_id;
end;
$$;

create or replace function public.bridge_originator_document_request_queue_view(
  p_export_package_id uuid,
  p_originator_profile_id uuid default auth.uid()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  assignment_exists boolean;
  v_requests jsonb;
begin
  if auth.role() <> 'service_role' and p_originator_profile_id is distinct from auth.uid() then
    raise exception 'Originator document request queue must use the authenticated originator profile';
  end if;

  select exists (
    select 1
    from public.transaction_bond_originator_workspace_assignments assignment
    where assignment.export_package_id = p_export_package_id
      and assignment.assigned_to_profile_id = p_originator_profile_id
      and assignment.status in ('assigned', 'accepted')
  ) into assignment_exists;

  if not assignment_exists and auth.role() <> 'service_role' then
    raise exception 'Originator is not assigned to this package';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'workspaceVersion', 'phase-r3-originator-document-requests-v1',
      'id', request.id,
      'exportPackageId', request.export_package_id,
      'transactionId', request.transaction_id,
      'submissionId', request.submission_id,
      'requestType', request.request_type,
      'status', request.status,
      'priority', request.request_priority,
      'targetScope', request.target_scope,
      'participantKey', request.participant_key,
      'participantRole', request.participant_role,
      'requirementKey', request.requirement_key,
      'canonicalDocumentType', request.canonical_document_type,
      'transactionRequiredDocumentId', request.transaction_required_document_id,
      'linkedDocumentId', request.linked_document_id,
      'title', request.title,
      'buyerInstruction', request.buyer_instruction,
      'buyerSafeFeedback', request.buyer_safe_feedback,
      'internalNote', request.internal_note,
      'dueAt', request.due_at,
      'sentAt', request.sent_at,
      'firstViewedAt', request.first_viewed_at,
      'uploadedAt', request.uploaded_at,
      'submittedForReviewAt', request.submitted_for_review_at,
      'reviewedAt', request.reviewed_at,
      'resolvedAt', request.resolved_at,
      'requiresNewSubmission', false,
      'supplementalOnly', true,
      'sensitivePayloadIncluded', false,
      'bankWorkflowUnchanged', true
    )
    order by
      case request.request_priority when 'urgent' then 0 else 1 end,
      request.due_at asc nulls last,
      request.created_at desc
  ), '[]'::jsonb)
  into v_requests
  from public.transaction_bond_originator_document_requests request
  where request.export_package_id = p_export_package_id
    and request.requires_new_submission = false
    and request.bank_workflow_unchanged = true;

  return jsonb_build_object(
    'available', true,
    'workspaceVersion', 'phase-r3-originator-document-requests-v1',
    'exportPackageId', p_export_package_id,
    'requests', v_requests,
    'summary', jsonb_build_object(
      'total', jsonb_array_length(v_requests),
      'open', (
        select count(*)
        from public.transaction_bond_originator_document_requests request
        where request.export_package_id = p_export_package_id
          and request.status in ('sent', 'viewed', 'in_progress', 'awaiting_review', 'rejected', 'needs_more_information')
      ),
      'awaitingReview', (
        select count(*)
        from public.transaction_bond_originator_document_requests request
        where request.export_package_id = p_export_package_id
          and request.status = 'awaiting_review'
      )
    ),
    'workflowBoundary', jsonb_build_object(
      'supplemental_only', true,
      'signed_snapshot_unchanged', true,
      'no_new_submission_version', true,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false,
      'bank_workflow_unchanged', true
    )
  );
end;
$$;

create or replace function public.bridge_client_portal_bond_originator_document_requests_view(
  p_participant_key text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text := public.bridge_client_portal_request_token();
  v_link public.client_portal_links%rowtype;
  v_package public.transaction_bond_application_export_packages%rowtype;
  v_requests jsonb;
begin
  if coalesce(v_token, '') = '' then
    return null;
  end if;

  select *
  into v_link
  from public.client_portal_links link
  where link.token = v_token
    and link.is_active = true
  order by link.updated_at desc nulls last, link.created_at desc nulls last
  limit 1;

  if not found then
    raise exception 'Client portal link is invalid or inactive.';
  end if;

  select *
  into v_package
  from public.transaction_bond_application_export_packages package
  where package.transaction_id = v_link.transaction_id
    and package.destination_key = 'bond_originator_intake'
    and package.status not in ('cancelled', 'superseded')
  order by package.package_ready_at desc nulls last, package.created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'workspaceVersion', 'phase-r3-originator-document-requests-v1',
      'id', request.id,
      'exportPackageId', request.export_package_id,
      'transactionId', request.transaction_id,
      'requestType', request.request_type,
      'status', request.status,
      'priority', request.request_priority,
      'targetScope', request.target_scope,
      'participantKey', request.participant_key,
      'participantRole', request.participant_role,
      'requirementKey', request.requirement_key,
      'canonicalDocumentType', request.canonical_document_type,
      'linkedDocumentId', request.linked_document_id,
      'title', request.title,
      'buyerInstruction', request.buyer_instruction,
      'buyerSafeFeedback', request.buyer_safe_feedback,
      'dueAt', request.due_at,
      'sentAt', request.sent_at,
      'firstViewedAt', request.first_viewed_at,
      'uploadedAt', request.uploaded_at,
      'submittedForReviewAt', request.submitted_for_review_at,
      'reviewedAt', request.reviewed_at,
      'requiresNewSubmission', false,
      'supplementalOnly', true,
      'bankWorkflowUnchanged', true
    )
    order by
      case request.request_priority when 'urgent' then 0 else 1 end,
      request.due_at asc nulls last,
      request.created_at desc
  ), '[]'::jsonb)
  into v_requests
  from public.transaction_bond_originator_document_requests request
  where request.export_package_id = v_package.id
    and request.requires_new_submission = false
    and request.bank_workflow_unchanged = true
    and (
      request.target_scope = 'application_documents'
      or request.participant_key is null
      or (p_participant_key is not null and request.participant_key = p_participant_key)
    );

  return jsonb_build_object(
    'available', true,
    'workspaceVersion', 'phase-r3-originator-document-requests-v1',
    'exportPackageId', v_package.id,
    'requests', v_requests,
    'workflowBoundary', jsonb_build_object(
      'supplemental_only', true,
      'signed_snapshot_unchanged', true,
      'no_new_submission_version', true,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false,
      'bank_workflow_unchanged', true
    )
  );
end;
$$;

revoke all on function public.bridge_create_bond_originator_workspace_document_request(uuid, text, text, uuid, text, text, text, text, uuid, text, text, text, timestamptz, text, uuid, text) from public;
grant execute on function public.bridge_create_bond_originator_workspace_document_request(uuid, text, text, uuid, text, text, text, text, uuid, text, text, text, timestamptz, text, uuid, text) to authenticated;

revoke all on function public.bridge_review_bond_originator_workspace_document_request(uuid, text, text, text, uuid) from public;
grant execute on function public.bridge_review_bond_originator_workspace_document_request(uuid, text, text, text, uuid) to authenticated;

revoke all on function public.bridge_originator_document_request_queue_view(uuid, uuid) from public;
grant execute on function public.bridge_originator_document_request_queue_view(uuid, uuid) to authenticated;

revoke all on function public.bridge_client_portal_bond_originator_document_requests_view(text) from public;
grant execute on function public.bridge_client_portal_bond_originator_document_requests_view(text) to anon, authenticated;

comment on function public.bridge_create_bond_originator_workspace_document_request(uuid, text, text, uuid, text, text, text, text, uuid, text, text, text, timestamptz, text, uuid, text) is
  'Phase R3 assigned-originator helper for creating missing, replacement or supplemental document requests from the workspace. It is supplemental-only: requires_new_submission = false, sensitive_payload_included = false, no_automatic_bank_submission = true, live_delivery_enabled = false, bank_workflow_unchanged = true.';
comment on function public.bridge_review_bond_originator_workspace_document_request(uuid, text, text, text, uuid) is
  'Phase R3 assigned-originator helper for accepting, rejecting, requesting more information or withdrawing a document request. It never mutates signed snapshots, offers, grants or bank workflow.';
comment on function public.bridge_originator_document_request_queue_view(uuid, uuid) is
  'Phase R3 metadata-only originator document request queue. It exposes assigned-package document request status and internal originator notes without exposing application payloads, public document URLs, tokens, OOBA delivery controls or bank workflow mutation controls.';
comment on function public.bridge_client_portal_bond_originator_document_requests_view(text) is
  'Phase R3 buyer-safe document request view for the client portal. It excludes internal notes, payload bodies, public document URLs, tokens and bank workflow controls; participant-specific filtering must be backed by participant-scoped access when available.';
comment on column public.transaction_bond_originator_document_requests.request_priority is
  'Phase R3 queue priority for document follow-up only. It is not bank priority, underwriting status or a lending decision.';
comment on column public.transaction_bond_originator_document_requests.workspace_version is
  'Phase R3 document request workspace version marker. The request remains supplemental-only and cannot require a new signed submission version.';
