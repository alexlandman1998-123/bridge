alter table public.transaction_bond_originator_bank_offer_captures
  add column if not exists workspace_version text not null default 'phase-r5-originator-offers-grants-capture-v1',
  add column if not exists originator_workspace_assignment_id uuid references public.transaction_bond_originator_workspace_assignments(id) on delete set null,
  add column if not exists capture_source text not null default 'originator_supplied',
  add column if not exists buyer_visibility_status text not null default 'originator_only';

alter table public.transaction_bond_originator_grant_captures
  add column if not exists workspace_version text not null default 'phase-r5-originator-offers-grants-capture-v1',
  add column if not exists originator_workspace_assignment_id uuid references public.transaction_bond_originator_workspace_assignments(id) on delete set null,
  add column if not exists capture_source text not null default 'originator_supplied',
  add column if not exists buyer_visibility_status text not null default 'originator_only';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.transaction_bond_originator_bank_offer_captures'::regclass
      and conname = 'transaction_bond_originator_bank_offer_captures_r5_boundary_check'
  ) then
    alter table public.transaction_bond_originator_bank_offer_captures
      add constraint transaction_bond_originator_bank_offer_captures_r5_boundary_check check (
        workspace_version = 'phase-r5-originator-offers-grants-capture-v1'
        and capture_source = 'originator_supplied'
        and buyer_visibility_status in ('originator_only', 'published_to_buyer', 'buyer_decided', 'withdrawn')
        and creates_bank_application = false
        and workflow_mutation_required = false
        and bank_workflow_unchanged = true
        and offer_workflow_unchanged = true
        and grant_workflow_unchanged = true
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.transaction_bond_originator_grant_captures'::regclass
      and conname = 'transaction_bond_originator_grant_captures_r5_boundary_check'
  ) then
    alter table public.transaction_bond_originator_grant_captures
      add constraint transaction_bond_originator_grant_captures_r5_boundary_check check (
        workspace_version = 'phase-r5-originator-offers-grants-capture-v1'
        and capture_source = 'originator_supplied'
        and buyer_visibility_status in ('originator_only', 'published_to_buyer', 'buyer_acknowledged', 'withdrawn')
        and creates_bank_application = false
        and bank_workflow_unchanged = true
        and offer_workflow_unchanged = true
        and grant_workflow_unchanged = true
      );
  end if;
end $$;

create index if not exists transaction_bond_originator_bank_offer_captures_workspace_assignment_idx
  on public.transaction_bond_originator_bank_offer_captures (originator_workspace_assignment_id, captured_at desc)
  where originator_workspace_assignment_id is not null;

create index if not exists transaction_bond_originator_bank_offer_captures_workspace_visibility_idx
  on public.transaction_bond_originator_bank_offer_captures (export_package_id, buyer_visibility_status, status, captured_at desc);

create index if not exists transaction_bond_originator_grant_captures_workspace_assignment_idx
  on public.transaction_bond_originator_grant_captures (originator_workspace_assignment_id, captured_at desc)
  where originator_workspace_assignment_id is not null;

create index if not exists transaction_bond_originator_grant_captures_workspace_visibility_idx
  on public.transaction_bond_originator_grant_captures (export_package_id, buyer_visibility_status, status, captured_at desc);

create or replace function public.bridge_capture_bond_originator_workspace_bank_offer(
  p_export_package_id uuid,
  p_bank_name text,
  p_offered_amount numeric default null,
  p_interest_rate numeric default null,
  p_interest_rate_type text default null,
  p_interest_rate_display text default null,
  p_monthly_repayment numeric default null,
  p_term_months integer default null,
  p_valid_until text default null,
  p_quote_document_id uuid default null,
  p_conditions_summary text default null,
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
  existing_offer_id uuid;
  offer_capture_id uuid;
begin
  if auth.role() <> 'service_role' and p_originator_profile_id is distinct from auth.uid() then
    raise exception 'Offer capture must use the authenticated originator profile';
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

  if package_record.status not in ('accepted_by_originator', 'downloaded') then
    raise exception 'Originator package must be accepted before offers can be captured';
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

  if coalesce(trim(p_bank_name), '') = '' then
    raise exception 'Bank name is required';
  end if;

  if p_idempotency_key is not null then
    select id into existing_offer_id
    from public.transaction_bond_originator_bank_offer_captures
    where export_package_id = p_export_package_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if existing_offer_id is not null then
      return existing_offer_id;
    end if;
  end if;

  insert into public.transaction_bond_originator_bank_offer_captures (
    export_package_id,
    transaction_id,
    bond_application_id,
    submission_id,
    destination_key,
    bank_name,
    offered_amount,
    interest_rate,
    interest_rate_type,
    interest_rate_display,
    monthly_repayment,
    term_months,
    valid_until,
    quote_document_id,
    conditions_summary,
    status,
    captured_by,
    captured_at,
    idempotency_key,
    workspace_version,
    originator_workspace_assignment_id,
    capture_source,
    buyer_visibility_status,
    creates_bank_application,
    workflow_mutation_required,
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
    trim(p_bank_name),
    p_offered_amount,
    p_interest_rate,
    nullif(trim(p_interest_rate_type), ''),
    nullif(trim(p_interest_rate_display), ''),
    p_monthly_repayment,
    p_term_months,
    p_valid_until,
    p_quote_document_id,
    nullif(trim(p_conditions_summary), ''),
    'captured',
    p_originator_profile_id,
    now(),
    p_idempotency_key,
    'phase-r5-originator-offers-grants-capture-v1',
    assignment_record.id,
    'originator_supplied',
    'originator_only',
    false,
    false,
    true,
    true,
    true,
    jsonb_build_object(
      'originator_supplied', true,
      'facilitation_only', true,
      'creates_bank_application', false,
      'no_automatic_bank_submission', true,
      'bank_workflow_unchanged', true,
      'offer_workflow_unchanged', true,
      'grant_workflow_unchanged', true
    )
  )
  returning id into offer_capture_id;

  return offer_capture_id;
end;
$$;

create or replace function public.bridge_publish_bond_originator_workspace_bank_offer(
  p_offer_capture_id uuid,
  p_originator_profile_id uuid default auth.uid(),
  p_linked_bond_quote_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  offer_record public.transaction_bond_originator_bank_offer_captures%rowtype;
  assignment_exists boolean;
begin
  if auth.role() <> 'service_role' and p_originator_profile_id is distinct from auth.uid() then
    raise exception 'Offer publication must use the authenticated originator profile';
  end if;

  select * into offer_record
  from public.transaction_bond_originator_bank_offer_captures
  where id = p_offer_capture_id
  for update;

  if not found then
    raise exception 'Offer capture not found';
  end if;

  select exists (
    select 1
    from public.transaction_bond_originator_workspace_assignments assignment
    where assignment.export_package_id = offer_record.export_package_id
      and assignment.assigned_to_profile_id = p_originator_profile_id
      and assignment.status in ('assigned', 'accepted')
  ) into assignment_exists;

  if not assignment_exists and auth.role() <> 'service_role' then
    raise exception 'Originator is not assigned to this package';
  end if;

  if offer_record.status = 'published_to_buyer' then
    return offer_record.id;
  end if;

  if offer_record.status not in ('draft', 'captured') then
    raise exception 'Offer capture is not publishable';
  end if;

  update public.transaction_bond_originator_bank_offer_captures
  set status = 'published_to_buyer',
      published_by = p_originator_profile_id,
      published_at = coalesce(published_at, now()),
      linked_bond_quote_id = coalesce(p_linked_bond_quote_id, linked_bond_quote_id),
      buyer_visibility_status = 'published_to_buyer',
      creates_bank_application = false,
      workflow_mutation_required = false,
      bank_workflow_unchanged = true,
      offer_workflow_unchanged = true,
      grant_workflow_unchanged = true,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'published_to_buyer', true,
        'facilitation_only', true,
        'automatic_write', false,
        'creates_bank_application', false,
        'bank_workflow_unchanged', true
      )
  where id = p_offer_capture_id;

  return p_offer_capture_id;
end;
$$;

create or replace function public.bridge_capture_bond_originator_workspace_grant(
  p_export_package_id uuid,
  p_bank_name text,
  p_approved_amount numeric default null,
  p_grant_document_id uuid default null,
  p_signed_grant_document_id uuid default null,
  p_grant_reference text default null,
  p_conditions_summary text default null,
  p_offer_capture_id uuid default null,
  p_linked_bond_quote_id uuid default null,
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
  existing_grant_id uuid;
  grant_capture_id uuid;
begin
  if auth.role() <> 'service_role' and p_originator_profile_id is distinct from auth.uid() then
    raise exception 'Grant capture must use the authenticated originator profile';
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

  if package_record.status not in ('accepted_by_originator', 'downloaded') then
    raise exception 'Originator package must be accepted before grants can be captured';
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

  if coalesce(trim(p_bank_name), '') = '' then
    raise exception 'Bank name is required';
  end if;

  if p_grant_document_id is null then
    raise exception 'Grant document is required';
  end if;

  if p_idempotency_key is not null then
    select id into existing_grant_id
    from public.transaction_bond_originator_grant_captures
    where export_package_id = p_export_package_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if existing_grant_id is not null then
      return existing_grant_id;
    end if;
  end if;

  insert into public.transaction_bond_originator_grant_captures (
    export_package_id,
    transaction_id,
    bond_application_id,
    submission_id,
    destination_key,
    offer_capture_id,
    linked_bond_quote_id,
    bank_name,
    approved_amount,
    grant_document_id,
    signed_grant_document_id,
    grant_reference,
    conditions_summary,
    status,
    captured_by,
    captured_at,
    idempotency_key,
    workspace_version,
    originator_workspace_assignment_id,
    capture_source,
    buyer_visibility_status,
    creates_bank_application,
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
    p_offer_capture_id,
    p_linked_bond_quote_id,
    trim(p_bank_name),
    p_approved_amount,
    p_grant_document_id,
    p_signed_grant_document_id,
    nullif(trim(p_grant_reference), ''),
    nullif(trim(p_conditions_summary), ''),
    case when p_signed_grant_document_id is null then 'received' else 'buyer_signed' end,
    p_originator_profile_id,
    now(),
    p_idempotency_key,
    'phase-r5-originator-offers-grants-capture-v1',
    assignment_record.id,
    'originator_supplied',
    'originator_only',
    false,
    true,
    true,
    true,
    jsonb_build_object(
      'originator_supplied', true,
      'facilitation_only', true,
      'creates_bank_application', false,
      'no_automatic_bank_submission', true,
      'bank_workflow_unchanged', true,
      'offer_workflow_unchanged', true,
      'grant_workflow_unchanged', true
    )
  )
  returning id into grant_capture_id;

  return grant_capture_id;
end;
$$;

create or replace function public.bridge_publish_bond_originator_workspace_grant(
  p_grant_capture_id uuid,
  p_originator_profile_id uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  grant_record public.transaction_bond_originator_grant_captures%rowtype;
  assignment_exists boolean;
begin
  if auth.role() <> 'service_role' and p_originator_profile_id is distinct from auth.uid() then
    raise exception 'Grant publication must use the authenticated originator profile';
  end if;

  select * into grant_record
  from public.transaction_bond_originator_grant_captures
  where id = p_grant_capture_id
  for update;

  if not found then
    raise exception 'Grant capture not found';
  end if;

  select exists (
    select 1
    from public.transaction_bond_originator_workspace_assignments assignment
    where assignment.export_package_id = grant_record.export_package_id
      and assignment.assigned_to_profile_id = p_originator_profile_id
      and assignment.status in ('assigned', 'accepted')
  ) into assignment_exists;

  if not assignment_exists and auth.role() <> 'service_role' then
    raise exception 'Originator is not assigned to this package';
  end if;

  if grant_record.status = 'published_to_buyer' then
    return grant_record.id;
  end if;

  if grant_record.status not in ('received', 'buyer_signed') then
    raise exception 'Grant capture is not publishable';
  end if;

  update public.transaction_bond_originator_grant_captures
  set status = 'published_to_buyer',
      published_by = p_originator_profile_id,
      published_at = coalesce(published_at, now()),
      buyer_visibility_status = 'published_to_buyer',
      creates_bank_application = false,
      bank_workflow_unchanged = true,
      offer_workflow_unchanged = true,
      grant_workflow_unchanged = true,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'published_to_buyer', true,
        'facilitation_only', true,
        'automatic_write', false,
        'creates_bank_application', false,
        'bank_workflow_unchanged', true
      )
  where id = p_grant_capture_id;

  return p_grant_capture_id;
end;
$$;

create or replace function public.bridge_originator_offer_grant_capture_workspace_view(
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
  v_offers jsonb;
  v_grants jsonb;
  v_latest_at timestamptz;
begin
  if auth.role() <> 'service_role' and p_originator_profile_id is distinct from auth.uid() then
    raise exception 'Offer and grant workspace view must use the authenticated originator profile';
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
      'workspaceVersion', 'phase-r5-originator-offers-grants-capture-v1',
      'id', offer.id,
      'exportPackageId', offer.export_package_id,
      'transactionId', offer.transaction_id,
      'submissionId', offer.submission_id,
      'type', 'bank_offer',
      'source', 'originator_supplied',
      'bankName', offer.bank_name,
      'offeredAmount', offer.offered_amount,
      'interestRate', offer.interest_rate,
      'interestRateType', offer.interest_rate_type,
      'interestRateDisplay', offer.interest_rate_display,
      'monthlyRepayment', offer.monthly_repayment,
      'termMonths', offer.term_months,
      'validUntil', offer.valid_until,
      'quoteDocumentId', offer.quote_document_id,
      'conditionsSummary', offer.conditions_summary,
      'status', offer.status,
      'buyerDecision', offer.buyer_decision,
      'publishedAt', offer.published_at,
      'capturedAt', offer.captured_at,
      'linkedBondQuoteId', offer.linked_bond_quote_id,
      'actions', jsonb_build_object(
        'canPublishToBuyer', offer.status in ('draft', 'captured'),
        'canCreateBankApplication', false,
        'canAutoSubmitToBank', false,
        'canMutateBankWorkflow', false,
        'canMutateOfferWorkflow', false,
        'canMutateGrantWorkflow', false
      ),
      'workflowBoundary', jsonb_build_object(
        'originatorSuppliedOnly', true,
        'noAutomaticBankSubmission', true,
        'live_delivery_enabled', false,
        'liveDeliveryEnabled', false,
        'createsBankApplication', false,
        'bankWorkflowUnchanged', true,
        'offerWorkflowUnchanged', true,
        'grantWorkflowUnchanged', true
      )
    )
    order by offer.captured_at desc
  ), '[]'::jsonb)
  into v_offers
  from public.transaction_bond_originator_bank_offer_captures offer
  where offer.export_package_id = p_export_package_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'workspaceVersion', 'phase-r5-originator-offers-grants-capture-v1',
      'id', grant_capture.id,
      'exportPackageId', grant_capture.export_package_id,
      'transactionId', grant_capture.transaction_id,
      'submissionId', grant_capture.submission_id,
      'type', 'bond_grant',
      'source', 'originator_supplied',
      'bankName', grant_capture.bank_name,
      'approvedAmount', grant_capture.approved_amount,
      'grantReference', grant_capture.grant_reference,
      'grantDocumentId', grant_capture.grant_document_id,
      'signedGrantDocumentId', grant_capture.signed_grant_document_id,
      'conditionsSummary', grant_capture.conditions_summary,
      'status', grant_capture.status,
      'publishedAt', grant_capture.published_at,
      'capturedAt', grant_capture.captured_at,
      'linkedBondQuoteId', grant_capture.linked_bond_quote_id,
      'offerCaptureId', grant_capture.offer_capture_id,
      'actions', jsonb_build_object(
        'canPublishToBuyer', grant_capture.status in ('received', 'buyer_signed'),
        'canCreateBankApplication', false,
        'canAutoSubmitToBank', false,
        'canMutateBankWorkflow', false,
        'canMutateOfferWorkflow', false,
        'canMutateGrantWorkflow', false
      ),
      'workflowBoundary', jsonb_build_object(
        'originatorSuppliedOnly', true,
        'noAutomaticBankSubmission', true,
        'live_delivery_enabled', false,
        'liveDeliveryEnabled', false,
        'createsBankApplication', false,
        'bankWorkflowUnchanged', true,
        'offerWorkflowUnchanged', true,
        'grantWorkflowUnchanged', true
      )
    )
    order by grant_capture.captured_at desc
  ), '[]'::jsonb)
  into v_grants
  from public.transaction_bond_originator_grant_captures grant_capture
  where grant_capture.export_package_id = p_export_package_id;

  select max(latest_at) into v_latest_at
  from (
    select max(coalesce(offer.buyer_decision_at, offer.published_at, offer.captured_at)) as latest_at
    from public.transaction_bond_originator_bank_offer_captures offer
    where offer.export_package_id = p_export_package_id
    union all
    select max(coalesce(grant_capture.published_at, grant_capture.captured_at)) as latest_at
    from public.transaction_bond_originator_grant_captures grant_capture
    where grant_capture.export_package_id = p_export_package_id
  ) latest;

  return jsonb_build_object(
    'available', true,
    'workspaceVersion', 'phase-r5-originator-offers-grants-capture-v1',
    'exportPackageId', p_export_package_id,
    'status', case
      when jsonb_array_length(v_offers) > 0 or jsonb_array_length(v_grants) > 0 then 'capture_started'
      else 'waiting_for_originator_capture'
    end,
    'offers', v_offers,
    'grants', v_grants,
    'summary', jsonb_build_object(
      'offerCount', jsonb_array_length(v_offers),
      'grantCount', jsonb_array_length(v_grants),
      'latestAt', v_latest_at,
      'bankWorkflowUnchanged', true,
      'offerWorkflowMutationDeferred', true,
      'grantWorkflowMutationDeferred', true
    ),
    'actions', jsonb_build_object(
      'canCaptureOffer', true,
      'canCaptureGrant', true,
      'canPublishToBuyer', true,
      'canCreateBankApplication', false,
      'canAutoSubmitToBank', false,
      'canMutateBankWorkflow', false,
      'canMutateOfferWorkflow', false,
      'canMutateGrantWorkflow', false,
      'canLiveDeliver', false
    ),
    'workflowBoundary', jsonb_build_object(
      'arch9FacilitatesOnly', true,
      'originatorProcessesExternally', true,
      'originatorSuppliedOnly', true,
      'noAutomaticBankSubmission', true,
      'live_delivery_enabled', false,
      'liveDeliveryEnabled', false,
      'createsBankApplication', false,
      'bankWorkflowUnchanged', true,
      'offerWorkflowUnchanged', true,
      'grantWorkflowUnchanged', true
    )
  );
end;
$$;

revoke all on function public.bridge_capture_bond_originator_workspace_bank_offer(uuid, text, numeric, numeric, text, text, numeric, integer, text, uuid, text, uuid, text) from public;
grant execute on function public.bridge_capture_bond_originator_workspace_bank_offer(uuid, text, numeric, numeric, text, text, numeric, integer, text, uuid, text, uuid, text) to authenticated;

revoke all on function public.bridge_publish_bond_originator_workspace_bank_offer(uuid, uuid, uuid) from public;
grant execute on function public.bridge_publish_bond_originator_workspace_bank_offer(uuid, uuid, uuid) to authenticated;

revoke all on function public.bridge_capture_bond_originator_workspace_grant(uuid, text, numeric, uuid, uuid, text, text, uuid, uuid, uuid, text) from public;
grant execute on function public.bridge_capture_bond_originator_workspace_grant(uuid, text, numeric, uuid, uuid, text, text, uuid, uuid, uuid, text) to authenticated;

revoke all on function public.bridge_publish_bond_originator_workspace_grant(uuid, uuid) from public;
grant execute on function public.bridge_publish_bond_originator_workspace_grant(uuid, uuid) to authenticated;

revoke all on function public.bridge_originator_offer_grant_capture_workspace_view(uuid, uuid) from public;
grant execute on function public.bridge_originator_offer_grant_capture_workspace_view(uuid, uuid) to authenticated;

comment on function public.bridge_capture_bond_originator_workspace_bank_offer(uuid, text, numeric, numeric, text, text, numeric, integer, text, uuid, text, uuid, text) is
  'Phase R5 originator workspace offer capture. Stores originator-supplied bank offer information for Arch9 facilitation only: creates_bank_application = false, automatic bank submission disabled, and bank/offer/grant workflow rows are not mutated automatically.';
comment on function public.bridge_publish_bond_originator_workspace_bank_offer(uuid, uuid, uuid) is
  'Phase R5 publishes an originator-captured offer to the buyer view without creating bank application rows or automatically accepting/declining any offer workflow record.';
comment on function public.bridge_capture_bond_originator_workspace_grant(uuid, text, numeric, uuid, uuid, text, text, uuid, uuid, uuid, text) is
  'Phase R5 originator workspace grant capture. Stores originator-supplied grant evidence while preserving bank_workflow_unchanged = true, offer_workflow_unchanged = true and grant_workflow_unchanged = true.';
comment on function public.bridge_publish_bond_originator_workspace_grant(uuid, uuid) is
  'Phase R5 publishes captured grant evidence to the buyer and attorney handoff surfaces without automatic grant workflow mutation.';
comment on function public.bridge_originator_offer_grant_capture_workspace_view(uuid, uuid) is
  'Phase R5 metadata-only offer/grant capture workspace view. It exposes originator-supplied offers and grants to assigned originators without raw delivery payloads, public document URLs, credentials, tokens, automatic bank submission, offer workflow mutation or grant workflow mutation. Safety flags include live_delivery_enabled = false.';
