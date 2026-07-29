alter table public.transaction_bond_originator_progress_events
  add column if not exists workspace_version text not null default 'phase-r4-originator-progress-tracking-v1',
  add column if not exists originator_workspace_assignment_id uuid references public.transaction_bond_originator_workspace_assignments(id) on delete set null,
  add column if not exists progress_category text not null default 'operational_update';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.transaction_bond_originator_progress_events'::regclass
      and conname = 'transaction_bond_originator_progress_events_category_check'
  ) then
    alter table public.transaction_bond_originator_progress_events
      add constraint transaction_bond_originator_progress_events_category_check check (
        progress_category in (
          'package',
          'document_request',
          'originator_processing',
          'offer_grant_tracking',
          'operational_update'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.transaction_bond_originator_progress_events'::regclass
      and conname = 'transaction_bond_originator_progress_events_workspace_boundary_check'
  ) then
    alter table public.transaction_bond_originator_progress_events
      add constraint transaction_bond_originator_progress_events_workspace_boundary_check check (
        workspace_version = 'phase-r4-originator-progress-tracking-v1'
        and bank_workflow_unchanged = true
        and offer_workflow_unchanged = true
        and grant_workflow_unchanged = true
      );
  end if;
end $$;

create index if not exists transaction_bond_originator_progress_events_workspace_assignment_idx
  on public.transaction_bond_originator_progress_events (originator_workspace_assignment_id, occurred_at desc)
  where originator_workspace_assignment_id is not null;

create index if not exists transaction_bond_originator_progress_events_workspace_visibility_idx
  on public.transaction_bond_originator_progress_events (
    export_package_id,
    visible_to_originator,
    visible_to_agent,
    visible_to_buyer,
    occurred_at desc
  );

create or replace function public.bridge_record_bond_originator_workspace_progress_update(
  p_export_package_id uuid,
  p_event_type text,
  p_status text,
  p_title text,
  p_summary text,
  p_internal_note text default null,
  p_visible_to_buyer boolean default true,
  p_visible_to_agent boolean default true,
  p_visible_to_originator boolean default true,
  p_progress_category text default 'operational_update',
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
  existing_event_id uuid;
  progress_event_id uuid;
begin
  if auth.role() <> 'service_role' and p_originator_profile_id is distinct from auth.uid() then
    raise exception 'Originator progress update must use the authenticated originator profile';
  end if;

  select * into package_record
  from public.transaction_bond_application_export_packages
  where id = p_export_package_id;

  if not found then
    raise exception 'Bond originator intake package not found';
  end if;

  if package_record.destination_key <> 'bond_originator_intake' then
    raise exception 'Export package is not a bond originator intake package';
  end if;

  if package_record.status not in ('ready_for_originator', 'accepted_by_originator', 'downloaded') then
    raise exception 'Originator package is not ready for progress tracking';
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

  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_summary), '') = '' then
    raise exception 'Progress title and summary are required';
  end if;

  if coalesce(p_event_type, 'originator_update') not in (
    'package_ready',
    'package_accepted',
    'package_downloaded',
    'documents_requested',
    'documents_uploaded',
    'documents_accepted',
    'originator_reviewing',
    'originator_processing',
    'originator_update',
    'on_hold',
    'completed'
  ) then
    raise exception 'Unsupported originator progress event type';
  end if;

  if coalesce(p_status, 'in_progress') not in (
    'pending',
    'in_progress',
    'waiting_for_buyer',
    'awaiting_originator_review',
    'completed',
    'on_hold'
  ) then
    raise exception 'Unsupported originator progress status';
  end if;

  if coalesce(p_progress_category, 'operational_update') not in (
    'package',
    'document_request',
    'originator_processing',
    'offer_grant_tracking',
    'operational_update'
  ) then
    raise exception 'Unsupported originator progress category';
  end if;

  if p_idempotency_key is not null then
    select id into existing_event_id
    from public.transaction_bond_originator_progress_events
    where export_package_id = p_export_package_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if existing_event_id is not null then
      return existing_event_id;
    end if;
  end if;

  insert into public.transaction_bond_originator_progress_events (
    export_package_id,
    transaction_id,
    bond_application_id,
    submission_id,
    destination_key,
    event_type,
    status,
    title,
    summary,
    internal_note,
    visible_to_buyer,
    visible_to_agent,
    visible_to_originator,
    occurred_at,
    recorded_by,
    idempotency_key,
    source,
    workspace_version,
    originator_workspace_assignment_id,
    progress_category,
    bank_workflow_unchanged,
    offer_workflow_unchanged,
    grant_workflow_unchanged,
    metadata
  )
  values (
    p_export_package_id,
    package_record.transaction_id,
    package_record.bond_application_id,
    package_record.submission_id,
    'bond_originator_intake',
    coalesce(p_event_type, 'originator_update'),
    coalesce(p_status, 'in_progress'),
    trim(p_title),
    trim(p_summary),
    nullif(trim(p_internal_note), ''),
    coalesce(p_visible_to_buyer, true),
    coalesce(p_visible_to_agent, true),
    coalesce(p_visible_to_originator, true),
    now(),
    p_originator_profile_id,
    p_idempotency_key,
    'originator',
    'phase-r4-originator-progress-tracking-v1',
    assignment_record.id,
    coalesce(p_progress_category, 'operational_update'),
    true,
    true,
    true,
    jsonb_build_object(
      'tracking_only', true,
      'progress_is_not_bank_decision', true,
      'sensitive_payload_included', false,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false,
      'bank_workflow_unchanged', true,
      'offer_workflow_unchanged', true,
      'grant_workflow_unchanged', true
    )
  )
  returning id into progress_event_id;

  return progress_event_id;
end;
$$;

create or replace function public.bridge_originator_progress_workspace_view(
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
  v_events jsonb;
  v_latest jsonb;
begin
  if auth.role() <> 'service_role' and p_originator_profile_id is distinct from auth.uid() then
    raise exception 'Originator progress workspace view must use the authenticated originator profile';
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
      'workspaceVersion', 'phase-r4-originator-progress-tracking-v1',
      'id', event.id,
      'exportPackageId', event.export_package_id,
      'transactionId', event.transaction_id,
      'eventType', event.event_type,
      'status', event.status,
      'title', event.title,
      'summary', event.summary,
      'internalNote', event.internal_note,
      'progressCategory', event.progress_category,
      'occurredAt', event.occurred_at,
      'recordedBy', event.recorded_by,
      'source', event.source,
      'visibleToBuyer', event.visible_to_buyer,
      'visibleToAgent', event.visible_to_agent,
      'visibleToOriginator', event.visible_to_originator,
      'trackingOnly', true,
      'sensitivePayloadIncluded', false,
      'bankWorkflowUnchanged', true,
      'offerWorkflowUnchanged', true,
      'grantWorkflowUnchanged', true
    )
    order by event.occurred_at asc, event.created_at asc
  ), '[]'::jsonb)
  into v_events
  from public.transaction_bond_originator_progress_events event
  where event.export_package_id = p_export_package_id
    and event.visible_to_originator = true;

  select value into v_latest
  from jsonb_array_elements(v_events) value
  order by value ->> 'occurredAt' desc nulls last
  limit 1;

  return jsonb_build_object(
    'available', true,
    'workspaceVersion', 'phase-r4-originator-progress-tracking-v1',
    'exportPackageId', p_export_package_id,
    'status', coalesce(v_latest ->> 'status', 'pending'),
    'headline', coalesce(v_latest ->> 'title', 'Originator progress pending'),
    'summary', coalesce(v_latest ->> 'summary', 'No visible originator progress update has been recorded yet.'),
    'lastUpdatedAt', v_latest ->> 'occurredAt',
    'events', v_events,
    'actions', jsonb_build_object(
      'canRecordProgress', true,
      'canMutateBankWorkflow', false,
      'canCreateOffer', false,
      'canCreateGrant', false,
      'canLiveDeliver', false
    ),
    'workflowBoundary', jsonb_build_object(
      'originator_processes_externally', true,
      'progress_is_not_bank_decision', true,
      'tracking_only', true,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false,
      'bank_workflow_unchanged', true,
      'offer_workflow_unchanged', true,
      'grant_workflow_unchanged', true
    )
  );
end;
$$;

create or replace function public.bridge_client_portal_bond_originator_progress_view()
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
  v_events jsonb;
  v_latest jsonb;
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
      'workspaceVersion', 'phase-r4-originator-progress-tracking-v1',
      'id', event.id,
      'eventType', event.event_type,
      'status', event.status,
      'title', event.title,
      'summary', event.summary,
      'occurredAt', event.occurred_at,
      'source', event.source,
      'trackingOnly', true,
      'sensitivePayloadIncluded', false,
      'bankWorkflowUnchanged', true
    )
    order by event.occurred_at asc, event.created_at asc
  ), '[]'::jsonb)
  into v_events
  from public.transaction_bond_originator_progress_events event
  where event.export_package_id = v_package.id
    and event.visible_to_buyer = true;

  select value into v_latest
  from jsonb_array_elements(v_events) value
  order by value ->> 'occurredAt' desc nulls last
  limit 1;

  return jsonb_build_object(
    'available', true,
    'workspaceVersion', 'phase-r4-originator-progress-tracking-v1',
    'exportPackageId', v_package.id,
    'status', coalesce(v_latest ->> 'status', 'pending'),
    'headline', coalesce(v_latest ->> 'title', 'Bond originator progress pending'),
    'summary', coalesce(v_latest ->> 'summary', 'No buyer-visible originator progress update has been recorded yet.'),
    'events', v_events,
    'workflowBoundary', jsonb_build_object(
      'originator_processes_externally', true,
      'progress_is_not_bank_decision', true,
      'tracking_only', true,
      'no_automatic_bank_submission', true,
      'live_delivery_enabled', false,
      'bank_workflow_unchanged', true
    )
  );
end;
$$;

revoke all on function public.bridge_record_bond_originator_workspace_progress_update(uuid, text, text, text, text, text, boolean, boolean, boolean, text, uuid, text) from public;
grant execute on function public.bridge_record_bond_originator_workspace_progress_update(uuid, text, text, text, text, text, boolean, boolean, boolean, text, uuid, text) to authenticated;

revoke all on function public.bridge_originator_progress_workspace_view(uuid, uuid) from public;
grant execute on function public.bridge_originator_progress_workspace_view(uuid, uuid) to authenticated;

revoke all on function public.bridge_client_portal_bond_originator_progress_view() from public;
grant execute on function public.bridge_client_portal_bond_originator_progress_view() to anon, authenticated;

comment on function public.bridge_record_bond_originator_workspace_progress_update(uuid, text, text, text, text, text, boolean, boolean, boolean, text, uuid, text) is
  'Phase R4 assigned-originator helper for recording operational progress updates. Progress is tracking-only and not a bank decision: sensitive_payload_included = false, no_automatic_bank_submission = true, live_delivery_enabled = false, bank_workflow_unchanged = true.';
comment on function public.bridge_originator_progress_workspace_view(uuid, uuid) is
  'Phase R4 metadata-only originator progress workspace view. It exposes assigned-package progress and originator-visible internal notes without exposing application payloads, public document URLs, tokens, OOBA delivery controls or bank workflow mutation controls.';
comment on function public.bridge_client_portal_bond_originator_progress_view() is
  'Phase R4 buyer-safe originator progress view for the client portal. It excludes internal notes, payload bodies, tokens and bank workflow controls. Progress is operational tracking only, not a lending decision.';
comment on column public.transaction_bond_originator_progress_events.progress_category is
  'Phase R4 operational progress category. This is not bank status, underwriting outcome or finance-stage progression.';
comment on column public.transaction_bond_originator_progress_events.workspace_version is
  'Phase R4 progress workspace version marker. Progress events remain tracking-only and cannot mutate bank, offer or grant workflow.';
