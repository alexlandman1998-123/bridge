begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.transaction_handover_backfill_batches (
  id uuid primary key default gen_random_uuid(),
  classifier_version text not null,
  report_digest text not null unique,
  reason text not null,
  operator_identifier text not null,
  expected_record_count integer not null,
  backfilled_record_count integer not null default 0,
  attorney_assignment_count integer not null default 0,
  bond_application_count integer not null default 0,
  status text not null default 'processing',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint transaction_handover_backfill_batches_digest_check
    check (report_digest ~ '^[0-9a-f]{64}$'),
  constraint transaction_handover_backfill_batches_reason_check
    check (length(btrim(reason)) between 8 and 500),
  constraint transaction_handover_backfill_batches_operator_check
    check (length(btrim(operator_identifier)) between 3 and 160),
  constraint transaction_handover_backfill_batches_expected_check
    check (expected_record_count between 1 and 500),
  constraint transaction_handover_backfill_batches_counts_check
    check (
      backfilled_record_count between 0 and expected_record_count
      and attorney_assignment_count >= 0
      and bond_application_count >= 0
    ),
  constraint transaction_handover_backfill_batches_status_check
    check (status in ('processing', 'completed'))
);

create table if not exists public.transaction_handover_backfill_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.transaction_handover_backfill_batches(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  classification text not null,
  confidence text not null,
  classifier_evidence jsonb not null default '{}'::jsonb,
  created_attorney_assignment_ids uuid[] not null default '{}'::uuid[],
  created_bond_application_ids uuid[] not null default '{}'::uuid[],
  created_finance_workflow_ids uuid[] not null default '{}'::uuid[],
  backfilled_at timestamptz not null default now(),
  constraint transaction_handover_backfill_records_classification_check
    check (classification = 'real'),
  constraint transaction_handover_backfill_records_confidence_check
    check (confidence in ('medium', 'high')),
  constraint transaction_handover_backfill_records_evidence_check
    check (jsonb_typeof(classifier_evidence) = 'object'),
  constraint transaction_handover_backfill_records_batch_transaction_key
    unique (batch_id, transaction_id)
);

create index if not exists transaction_handover_backfill_records_transaction_idx
  on public.transaction_handover_backfill_records (transaction_id, backfilled_at desc);

alter table public.transaction_handover_backfill_batches enable row level security;
alter table public.transaction_handover_backfill_records enable row level security;

revoke all on table public.transaction_handover_backfill_batches from public, anon, authenticated;
revoke all on table public.transaction_handover_backfill_records from public, anon, authenticated;
grant select, insert, update on table public.transaction_handover_backfill_batches to service_role;
grant select, insert, update on table public.transaction_handover_backfill_records to service_role;

comment on table public.transaction_handover_backfill_batches is
  'Service-only audit batches for canonical handover backfills on independently verified genuine transactions.';
comment on table public.transaction_handover_backfill_records is
  'Transaction-level evidence and canonical record IDs created by a genuine handover backfill batch.';

create or replace function public.bridge_backfill_genuine_transaction_handovers(
  p_classification_rows jsonb,
  p_classifier_version text,
  p_report_digest text,
  p_reason text,
  p_operator_identifier text,
  p_expected_count integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch_id uuid;
  v_ids uuid[];
  v_input_count integer;
  v_distinct_count integer;
  v_locked_count integer;
  v_verified_count integer;
  v_issue_count integer;
  v_attorney_count integer := 0;
  v_bond_count integer := 0;
  v_existing_batch public.transaction_handover_backfill_batches%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Genuine transaction backfill requires the service role.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_classification_rows) <> 'array' then
    raise exception 'Classification rows must be a JSON array.' using errcode = '22023';
  end if;

  v_input_count := jsonb_array_length(p_classification_rows);
  if p_expected_count is null or p_expected_count <> v_input_count or v_input_count not between 1 and 500 then
    raise exception 'Expected count does not match the bounded classification set.' using errcode = '22023';
  end if;
  if nullif(btrim(p_classifier_version), '') is null then
    raise exception 'Classifier version is required.' using errcode = '22023';
  end if;
  if coalesce(p_report_digest, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'A lowercase SHA-256 report digest is required.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 8 and 500 then
    raise exception 'A meaningful backfill reason is required.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_operator_identifier, ''))) not between 3 and 160 then
    raise exception 'An operator identifier is required.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_classification_rows) row_data
    where jsonb_typeof(row_data) <> 'object'
       or row_data ->> 'classification' <> 'real'
       or row_data ->> 'confidence' not in ('medium', 'high')
       or row_data ->> 'proposedAction' <> 'backfill_canonical_handover'
       or nullif(row_data ->> 'transactionId', '') is null
  ) then
    raise exception 'Every row must be a medium/high-confidence real transaction approved for canonical handover backfill.' using errcode = '22023';
  end if;

  begin
    select array_agg((row_data ->> 'transactionId')::uuid order by row_data ->> 'transactionId'),
           count(distinct row_data ->> 'transactionId')
      into v_ids, v_distinct_count
      from jsonb_array_elements(p_classification_rows) row_data;
  exception
    when invalid_text_representation then
      raise exception 'Every transaction ID must be a valid UUID.' using errcode = '22023';
  end;
  if v_distinct_count <> v_input_count then
    raise exception 'Duplicate transaction IDs are not allowed.' using errcode = '22023';
  end if;

  select * into v_existing_batch
    from public.transaction_handover_backfill_batches
   where report_digest = p_report_digest;
  if found then
    if v_existing_batch.classifier_version <> p_classifier_version
       or v_existing_batch.expected_record_count <> p_expected_count then
      raise exception 'The report digest is already bound to a different backfill request.' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'batchId', v_existing_batch.id,
      'status', v_existing_batch.status,
      'backfilledCount', v_existing_batch.backfilled_record_count,
      'attorneyAssignmentCount', v_existing_batch.attorney_assignment_count,
      'bondApplicationCount', v_existing_batch.bond_application_count,
      'idempotentReplay', true
    );
  end if;

  perform transaction_row.id
    from public.transactions transaction_row
   where transaction_row.id = any(v_ids)
   order by transaction_row.id
   for update;
  get diagnostics v_locked_count = row_count;
  if v_locked_count <> v_input_count then
    raise exception 'The requested classification set contains missing transactions.' using errcode = 'P0002';
  end if;

  select count(*) into v_verified_count
  from public.transactions transaction_row
  left join public.buyers buyer on buyer.id = transaction_row.buyer_id
  left join public.organisations organisation on organisation.id = transaction_row.organisation_id
  left join public.private_listings listing on listing.id = transaction_row.listing_id
  left join public.units unit_row on unit_row.id = transaction_row.unit_id
  where transaction_row.id = any(v_ids)
    and transaction_row.is_active is true
    and transaction_row.quarantined_at is null
    and transaction_row.quarantine_batch_id is null
    and transaction_row.is_demo_data is not true
    and coalesce(transaction_row.demo_metadata, '{}'::jsonb) = '{}'::jsonb
    and coalesce(buyer.is_demo_data, false) is false
    and coalesce(buyer.demo_metadata, '{}'::jsonb) = '{}'::jsonb
    and coalesce(organisation.is_demo_data, false) is false
    and coalesce(listing.is_demo_data, false) is false
    and coalesce(listing.demo_metadata, '{}'::jsonb) = '{}'::jsonb
    and lower(split_part(coalesce(buyer.email, ''), '@', 2)) not in ('demo.bridgefinance.co.za', 'example.com', 'example.net', 'example.org', 'example.test', 'invalid', 'localhost')
    and lower(split_part(coalesce(organisation.company_email, organisation.email, ''), '@', 2)) not in ('demo.bridgefinance.co.za', 'example.com', 'example.net', 'example.org', 'example.test', 'invalid', 'localhost')
    and coalesce(unit_row.notes, '') !~* '(demo|fixture|seed|test transaction|acceptance|full[-_ ]?e2e|bond[-_ ]?runtime)'
    and not exists (
      select 1
      from public.transaction_role_players roleplayer
      where roleplayer.transaction_id = transaction_row.id
        and (
          roleplayer.is_demo_data is true
          or lower(split_part(coalesce(roleplayer.email_address, ''), '@', 2)) in ('demo.bridgefinance.co.za', 'example.com', 'example.net', 'example.org', 'example.test', 'invalid', 'localhost')
        )
    )
    and (
      (transaction_row.created_by is not null)::integer
      + (organisation.id is not null and coalesce(lower(organisation.status), 'active') not in ('inactive', 'disabled', 'deleted'))::integer
      + (nullif(btrim(coalesce(buyer.email, '')), '') is not null)::integer
    ) >= 2;

  if v_verified_count <> v_input_count then
    raise exception 'Database evidence did not independently verify every row as genuine; no rows were changed.' using errcode = '22023';
  end if;

  select count(*) into v_issue_count
  from public.transactions transaction_row
  where transaction_row.id = any(v_ids)
    and (
      exists (
        select 1
        from public.transaction_role_players roleplayer
        where roleplayer.transaction_id = transaction_row.id
          and roleplayer.role_type in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney')
          and coalesce(roleplayer.assignment_status, roleplayer.status, 'selected') not in ('removed', 'declined', 'rejected')
          and roleplayer.removed_at is null
          and not exists (
            select 1 from public.transaction_attorney_assignments assignment
            where assignment.transaction_id = transaction_row.id
              and assignment.attorney_role = roleplayer.role_type
              and coalesce(assignment.assignment_status, assignment.status, 'pending') not in ('removed', 'declined', 'rejected', 'inactive', 'suspended')
          )
      )
      or (
        lower(coalesce(transaction_row.finance_type, '')) in ('bond', 'hybrid', 'combination', 'bond_and_cash', 'cash_and_bond')
        and exists (
          select 1 from public.transaction_role_players roleplayer
          where roleplayer.transaction_id = transaction_row.id
            and roleplayer.role_type = 'bond_originator'
            and coalesce(roleplayer.assignment_status, roleplayer.status, 'selected') not in ('removed', 'declined', 'rejected')
            and roleplayer.removed_at is null
        )
        and not exists (
          select 1 from public.transaction_bond_applications application
          where application.transaction_id = transaction_row.id
            and application.application_type = 'originator_intake'
            and coalesce(application.assignment_status, application.status, 'pending') not in ('inactive', 'declined', 'rejected')
        )
      )
    );
  if v_issue_count <> v_input_count then
    raise exception 'Every genuine transaction must still have a canonical handover gap at apply time.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.transaction_role_players roleplayer
    where roleplayer.transaction_id = any(v_ids)
      and roleplayer.role_type in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney', 'bond_originator')
      and coalesce(roleplayer.assignment_status, roleplayer.status, 'selected') not in ('removed', 'declined', 'rejected')
      and roleplayer.removed_at is null
    group by roleplayer.transaction_id, roleplayer.role_type
    having count(*) > 1
  ) then
    raise exception 'Competing active handover roleplayers require manual review; no rows were changed.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.transaction_role_players roleplayer
    where roleplayer.transaction_id = any(v_ids)
      and roleplayer.role_type in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney')
      and coalesce(roleplayer.assignment_status, roleplayer.status, 'selected') not in ('removed', 'declined', 'rejected')
      and roleplayer.removed_at is null
      and not exists (
        select 1 from public.transaction_attorney_assignments assignment
        where assignment.transaction_id = roleplayer.transaction_id
          and assignment.attorney_role = roleplayer.role_type
          and coalesce(assignment.assignment_status, assignment.status, 'pending') not in ('removed', 'declined', 'rejected', 'inactive', 'suspended')
      )
      and (
        select count(distinct firm.id)
        from public.attorney_firms firm
        where coalesce(firm.is_active, true) is true
          and coalesce(firm.is_demo_data, false) is false
          and (
            (
              coalesce(roleplayer.assigned_organisation_id, roleplayer.partner_organisation_id, roleplayer.organisation_id) is not null
              and firm.organisation_id = coalesce(roleplayer.assigned_organisation_id, roleplayer.partner_organisation_id, roleplayer.organisation_id)
            )
            or lower(btrim(coalesce(firm.email, ''))) = lower(btrim(coalesce(roleplayer.email_address, '')))
            or lower(btrim(coalesce(firm.name, ''))) = lower(btrim(coalesce(roleplayer.partner_name, '')))
          )
      ) <> 1
  ) then
    raise exception 'Every attorney roleplayer must resolve to exactly one active non-demo attorney firm.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.transaction_role_players roleplayer
    join public.transactions transaction_row on transaction_row.id = roleplayer.transaction_id
    where roleplayer.transaction_id = any(v_ids)
      and roleplayer.role_type = 'bond_originator'
      and lower(coalesce(transaction_row.finance_type, '')) in ('bond', 'hybrid', 'combination', 'bond_and_cash', 'cash_and_bond')
      and coalesce(roleplayer.assignment_status, roleplayer.status, 'selected') not in ('removed', 'declined', 'rejected')
      and roleplayer.removed_at is null
      and coalesce(roleplayer.assigned_organisation_id, roleplayer.partner_organisation_id, roleplayer.organisation_id, roleplayer.assigned_user_id, roleplayer.user_id) is null
  ) then
    raise exception 'Every bond-originator roleplayer must retain a canonical organisation or user scope.' using errcode = '22023';
  end if;

  insert into public.transaction_handover_backfill_batches (
    classifier_version, report_digest, reason, operator_identifier, expected_record_count, status
  ) values (
    p_classifier_version, p_report_digest, btrim(p_reason), btrim(p_operator_identifier), p_expected_count, 'processing'
  ) returning id into v_batch_id;

  insert into public.transaction_handover_backfill_records (
    batch_id, transaction_id, classification, confidence, classifier_evidence, backfilled_at
  )
  select
    v_batch_id,
    (row_data ->> 'transactionId')::uuid,
    'real',
    row_data ->> 'confidence',
    jsonb_build_object(
      'issues', coalesce(row_data -> 'issues', '[]'::jsonb),
      'evidence', coalesce(row_data -> 'evidence', '{}'::jsonb),
      'scope', coalesce(row_data -> 'scope', '{}'::jsonb)
    ),
    v_now
  from jsonb_array_elements(p_classification_rows) row_data;

  insert into public.transaction_attorney_assignments (
    transaction_id,
    firm_id,
    attorney_firm_id,
    assignment_type,
    attorney_role,
    matter_type,
    instruction_status,
    assigned_organisation_id,
    scope_level,
    scope_metadata,
    primary_attorney_id,
    attorney_user_id,
    preferred_contact_name,
    preferred_contact_email,
    preferred_contact_phone,
    appointment_source,
    firm_acceptance_status,
    staff_assignment_status,
    allocation_state,
    status,
    assignment_status,
    is_primary,
    visibility_scope,
    can_edit,
    can_manage_documents,
    can_manage_signing,
    can_add_internal_notes,
    can_add_shared_updates,
    can_update_workflow_lane,
    assigned_by,
    assigned_at,
    updated_at
  )
  select
    roleplayer.transaction_id,
    resolved_firm.id,
    resolved_firm.id,
    case roleplayer.role_type
      when 'bond_attorney' then 'bond'
      when 'cancellation_attorney' then 'cancellation'
      else 'transfer'
    end,
    roleplayer.role_type,
    case roleplayer.role_type
      when 'bond_attorney' then 'bond'
      when 'cancellation_attorney' then 'cancellation'
      else 'transfer'
    end,
    'new_instruction',
    resolved_firm.organisation_id,
    'organisation',
    jsonb_build_object(
      'source', 'historical_genuine_backfill',
      'backfillBatchId', v_batch_id,
      'roleplayerId', roleplayer.id,
      'firmFirstAllocation', true
    ),
    null,
    null,
    roleplayer.contact_person,
    roleplayer.email_address,
    roleplayer.phone_number,
    'historical_genuine_backfill',
    'awaiting_firm_acceptance',
    'awaiting_staff_assignment',
    'awaiting_firm_acceptance',
    'pending',
    'pending',
    true,
    'firm_matter',
    true, true, true, true, true, true,
    transaction_row.created_by,
    v_now,
    v_now
  from public.transaction_role_players roleplayer
  join public.transactions transaction_row on transaction_row.id = roleplayer.transaction_id
  join lateral (
    select firm.*
    from public.attorney_firms firm
    where coalesce(firm.is_active, true) is true
      and coalesce(firm.is_demo_data, false) is false
      and (
        (
          coalesce(roleplayer.assigned_organisation_id, roleplayer.partner_organisation_id, roleplayer.organisation_id) is not null
          and firm.organisation_id = coalesce(roleplayer.assigned_organisation_id, roleplayer.partner_organisation_id, roleplayer.organisation_id)
        )
        or lower(btrim(coalesce(firm.email, ''))) = lower(btrim(coalesce(roleplayer.email_address, '')))
        or lower(btrim(coalesce(firm.name, ''))) = lower(btrim(coalesce(roleplayer.partner_name, '')))
      )
    order by firm.updated_at desc nulls last, firm.id
    limit 1
  ) resolved_firm on true
  where roleplayer.transaction_id = any(v_ids)
    and roleplayer.role_type in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney')
    and coalesce(roleplayer.assignment_status, roleplayer.status, 'selected') not in ('removed', 'declined', 'rejected')
    and roleplayer.removed_at is null
    and not exists (
      select 1 from public.transaction_attorney_assignments assignment
      where assignment.transaction_id = roleplayer.transaction_id
        and assignment.attorney_role = roleplayer.role_type
        and coalesce(assignment.assignment_status, assignment.status, 'pending') not in ('removed', 'declined', 'rejected', 'inactive', 'suspended')
    );
  get diagnostics v_attorney_count = row_count;

  update public.transaction_handover_backfill_records record
     set created_attorney_assignment_ids = coalesce(created.ids, '{}'::uuid[])
    from (
      select assignment.transaction_id, array_agg(assignment.id order by assignment.id) ids
      from public.transaction_attorney_assignments assignment
      where assignment.scope_metadata ->> 'backfillBatchId' = v_batch_id::text
      group by assignment.transaction_id
    ) created
   where record.batch_id = v_batch_id
     and record.transaction_id = created.transaction_id;

  with inserted_workflows as (
    insert into public.transaction_finance_workflows (
      transaction_id, workflow_type, current_stage, status, last_updated_at, created_at, updated_at
    )
    select distinct transaction_row.id, 'bond_hybrid', 'intake', 'active', v_now, v_now, v_now
    from public.transactions transaction_row
    join public.transaction_role_players roleplayer on roleplayer.transaction_id = transaction_row.id
    where transaction_row.id = any(v_ids)
      and lower(coalesce(transaction_row.finance_type, '')) in ('bond', 'hybrid', 'combination', 'bond_and_cash', 'cash_and_bond')
      and roleplayer.role_type = 'bond_originator'
      and coalesce(roleplayer.assignment_status, roleplayer.status, 'selected') not in ('removed', 'declined', 'rejected')
      and roleplayer.removed_at is null
    on conflict (transaction_id, workflow_type) do nothing
    returning id, transaction_id
  )
  update public.transaction_handover_backfill_records record
     set created_finance_workflow_ids = array[inserted.id]
    from inserted_workflows inserted
   where record.batch_id = v_batch_id
     and record.transaction_id = inserted.transaction_id;

  insert into public.transaction_bond_applications (
    transaction_id,
    workflow_id,
    buyer_party_id,
    application_type,
    assigned_organisation_id,
    assigned_region_id,
    assigned_workspace_unit_id,
    assigned_branch_id,
    assigned_team_id,
    assigned_user_id,
    scope_level,
    scope_metadata,
    assignment_status,
    assignment_source,
    bank_name,
    status,
    notes,
    created_by,
    updated_by,
    metadata,
    created_at,
    updated_at
  )
  select
    transaction_row.id,
    workflow.id,
    transaction_row.buyer_id,
    'originator_intake',
    coalesce(roleplayer.assigned_organisation_id, roleplayer.partner_organisation_id, roleplayer.organisation_id),
    roleplayer.assigned_region_id,
    coalesce(roleplayer.assigned_workspace_unit_id, roleplayer.workspace_unit_id),
    coalesce(roleplayer.assigned_branch_id, roleplayer.branch_id),
    roleplayer.assigned_team_id,
    coalesce(roleplayer.assigned_user_id, roleplayer.user_id),
    case
      when coalesce(roleplayer.assigned_user_id, roleplayer.user_id) is not null then 'user'
      when roleplayer.assigned_team_id is not null then 'team'
      when coalesce(roleplayer.assigned_branch_id, roleplayer.branch_id, roleplayer.assigned_workspace_unit_id, roleplayer.workspace_unit_id) is not null then 'branch'
      when roleplayer.assigned_region_id is not null then 'region'
      else 'organisation'
    end,
    jsonb_build_object(
      'source', 'historical_genuine_backfill',
      'backfillBatchId', v_batch_id,
      'roleplayerId', roleplayer.id
    ),
    case
      when coalesce(roleplayer.assigned_user_id, roleplayer.user_id) is not null then 'consultant_assigned'
      when roleplayer.assigned_team_id is not null then 'team_queue'
      when coalesce(roleplayer.assigned_branch_id, roleplayer.branch_id, roleplayer.assigned_workspace_unit_id, roleplayer.workspace_unit_id) is not null then 'branch_queue'
      when roleplayer.assigned_region_id is not null then 'region_queue'
      else 'organisation_queue'
    end,
    'system_repair',
    'Bond Originator Intake',
    'pending',
    'Canonical bond-originator intake created by guarded genuine transaction backfill.',
    null,
    null,
    jsonb_build_object(
      'source', 'historical_genuine_backfill',
      'backfillBatchId', v_batch_id,
      'roleplayerId', roleplayer.id,
      'canonicalStatus', 'new_application'
    ),
    v_now,
    v_now
  from public.transactions transaction_row
  join public.transaction_role_players roleplayer on roleplayer.transaction_id = transaction_row.id
  join public.transaction_finance_workflows workflow
    on workflow.transaction_id = transaction_row.id and workflow.workflow_type = 'bond_hybrid'
  where transaction_row.id = any(v_ids)
    and lower(coalesce(transaction_row.finance_type, '')) in ('bond', 'hybrid', 'combination', 'bond_and_cash', 'cash_and_bond')
    and roleplayer.role_type = 'bond_originator'
    and coalesce(roleplayer.assignment_status, roleplayer.status, 'selected') not in ('removed', 'declined', 'rejected')
    and roleplayer.removed_at is null
    and not exists (
      select 1 from public.transaction_bond_applications application
      where application.transaction_id = transaction_row.id
        and application.application_type = 'originator_intake'
        and coalesce(application.assignment_status, application.status, 'pending') not in ('inactive', 'declined', 'rejected')
    );
  get diagnostics v_bond_count = row_count;

  update public.transaction_handover_backfill_records record
     set created_bond_application_ids = coalesce(created.ids, '{}'::uuid[])
    from (
      select application.transaction_id, array_agg(application.id order by application.id) ids
      from public.transaction_bond_applications application
      where application.metadata ->> 'backfillBatchId' = v_batch_id::text
      group by application.transaction_id
    ) created
   where record.batch_id = v_batch_id
     and record.transaction_id = created.transaction_id;

  if v_attorney_count + v_bond_count = 0 then
    raise exception 'No canonical handover records were created; the batch was rolled back.' using errcode = '22023';
  end if;

  insert into public.transaction_events (
    transaction_id, event_type, event_data, created_by_role, visibility_scope, is_demo_data
  )
  select
    record.transaction_id,
    'GenuineTransactionHandoverBackfilled',
    jsonb_build_object(
      'batchId', v_batch_id,
      'classifierVersion', p_classifier_version,
      'reportDigest', p_report_digest,
      'attorneyAssignmentIds', to_jsonb(record.created_attorney_assignment_ids),
      'bondApplicationIds', to_jsonb(record.created_bond_application_ids)
    ),
    'system',
    'internal',
    false
  from public.transaction_handover_backfill_records record
  where record.batch_id = v_batch_id
    and (
      cardinality(record.created_attorney_assignment_ids) > 0
      or cardinality(record.created_bond_application_ids) > 0
    );

  update public.transaction_handover_backfill_batches
     set backfilled_record_count = (
           select count(*)
           from public.transaction_handover_backfill_records record
           where record.batch_id = v_batch_id
             and (
               cardinality(record.created_attorney_assignment_ids) > 0
               or cardinality(record.created_bond_application_ids) > 0
             )
         ),
         attorney_assignment_count = v_attorney_count,
         bond_application_count = v_bond_count,
         status = 'completed',
         completed_at = v_now
   where id = v_batch_id;

  return jsonb_build_object(
    'batchId', v_batch_id,
    'status', 'completed',
    'backfilledCount', (
      select count(*)
      from public.transaction_handover_backfill_records record
      where record.batch_id = v_batch_id
        and (
          cardinality(record.created_attorney_assignment_ids) > 0
          or cardinality(record.created_bond_application_ids) > 0
        )
    ),
    'attorneyAssignmentCount', v_attorney_count,
    'bondApplicationCount', v_bond_count,
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.bridge_backfill_genuine_transaction_handovers(jsonb, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.bridge_backfill_genuine_transaction_handovers(jsonb, text, text, text, text, integer)
  to service_role;

commit;
