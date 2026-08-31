begin;

-- Production migration ledger version: 20260831151015.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.transaction_quarantine_batches (
  id uuid primary key default gen_random_uuid(),
  classifier_version text not null,
  report_digest text not null,
  reason text not null,
  operator_identifier text not null,
  expected_record_count integer not null,
  quarantined_record_count integer not null default 0,
  status text not null default 'processing',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  restored_at timestamptz,
  restore_reason text,
  constraint transaction_quarantine_batches_report_digest_check
    check (report_digest ~ '^[0-9a-f]{64}$'),
  constraint transaction_quarantine_batches_reason_check
    check (length(btrim(reason)) between 8 and 500),
  constraint transaction_quarantine_batches_operator_check
    check (length(btrim(operator_identifier)) between 3 and 160),
  constraint transaction_quarantine_batches_expected_count_check
    check (expected_record_count between 1 and 500),
  constraint transaction_quarantine_batches_count_check
    check (quarantined_record_count between 0 and expected_record_count),
  constraint transaction_quarantine_batches_status_check
    check (status in ('processing', 'completed', 'restored')),
  constraint transaction_quarantine_batches_report_digest_key unique (report_digest)
);

create table if not exists public.transaction_quarantine_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.transaction_quarantine_batches(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  classification text not null,
  confidence text not null,
  classifier_evidence jsonb not null default '{}'::jsonb,
  original_transaction_state jsonb not null,
  original_buyer_portal_state jsonb not null default '[]'::jsonb,
  original_seller_portal_state jsonb not null default '[]'::jsonb,
  original_roleplayer_state jsonb not null default '[]'::jsonb,
  quarantined_at timestamptz not null default now(),
  restored_at timestamptz,
  constraint transaction_quarantine_records_classification_check
    check (classification = 'seed'),
  constraint transaction_quarantine_records_confidence_check
    check (confidence = 'high'),
  constraint transaction_quarantine_records_evidence_check
    check (jsonb_typeof(classifier_evidence) = 'object'),
  constraint transaction_quarantine_records_transaction_state_check
    check (jsonb_typeof(original_transaction_state) = 'object'),
  constraint transaction_quarantine_records_buyer_portal_state_check
    check (jsonb_typeof(original_buyer_portal_state) = 'array'),
  constraint transaction_quarantine_records_seller_portal_state_check
    check (jsonb_typeof(original_seller_portal_state) = 'array'),
  constraint transaction_quarantine_records_roleplayer_state_check
    check (jsonb_typeof(original_roleplayer_state) = 'array'),
  constraint transaction_quarantine_records_batch_transaction_key
    unique (batch_id, transaction_id)
);

create unique index if not exists transaction_quarantine_records_active_transaction_idx
  on public.transaction_quarantine_records (transaction_id)
  where restored_at is null;

create index if not exists transaction_quarantine_records_batch_idx
  on public.transaction_quarantine_records (batch_id, transaction_id);

alter table public.transaction_quarantine_batches enable row level security;
alter table public.transaction_quarantine_records enable row level security;

revoke all on table public.transaction_quarantine_batches from public, anon, authenticated;
revoke all on table public.transaction_quarantine_records from public, anon, authenticated;
grant select, insert, update on table public.transaction_quarantine_batches to service_role;
grant select, insert, update on table public.transaction_quarantine_records to service_role;

alter table public.transactions
  add column if not exists quarantined_at timestamptz,
  add column if not exists quarantine_batch_id uuid references public.transaction_quarantine_batches(id) on delete restrict,
  add column if not exists quarantine_reason text;

alter table public.transactions
  drop constraint if exists transactions_quarantine_state_check;
alter table public.transactions
  add constraint transactions_quarantine_state_check
  check (
    (quarantined_at is null and quarantine_batch_id is null and quarantine_reason is null)
    or
    (quarantined_at is not null and quarantine_batch_id is not null and nullif(btrim(quarantine_reason), '') is not null)
  ) not valid;
alter table public.transactions validate constraint transactions_quarantine_state_check;

create index if not exists transactions_quarantined_at_idx
  on public.transactions (quarantined_at desc)
  where quarantined_at is not null;

comment on table public.transaction_quarantine_batches is
  'Service-only, reversible audit batches for high-confidence seed transaction quarantine operations.';
comment on table public.transaction_quarantine_records is
  'Immutable pre-quarantine snapshots used to audit and restore quarantined seed transactions.';
comment on column public.transactions.quarantined_at is
  'Set only by the guarded seed quarantine operation. Quarantined rows are inactive and excluded from live workspaces.';

create or replace function public.bridge_quarantine_seed_transactions(
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
  v_existing_batch public.transaction_quarantine_batches%rowtype;
  v_locked_count integer;
  v_verified_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Seed transaction quarantine requires the service role.' using errcode = '42501';
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
    raise exception 'A meaningful quarantine reason is required.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_operator_identifier, ''))) not between 3 and 160 then
    raise exception 'An operator identifier is required.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_classification_rows) row_data
    where jsonb_typeof(row_data) <> 'object'
       or row_data ->> 'classification' <> 'seed'
       or row_data ->> 'confidence' <> 'high'
       or nullif(row_data ->> 'transactionId', '') is null
  ) then
    raise exception 'Every classification row must be a high-confidence seed with a transaction ID.' using errcode = '22023';
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

  select *
    into v_existing_batch
    from public.transaction_quarantine_batches
   where report_digest = p_report_digest;
  if found then
    if v_existing_batch.classifier_version <> p_classifier_version
       or v_existing_batch.expected_record_count <> p_expected_count then
      raise exception 'The report digest is already bound to a different quarantine request.' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'batchId', v_existing_batch.id,
      'status', v_existing_batch.status,
      'quarantinedCount', v_existing_batch.quarantined_record_count,
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

  select count(*)
    into v_verified_count
    from public.transactions transaction_row
    left join public.buyers buyer on buyer.id = transaction_row.buyer_id
    left join public.organisations organisation on organisation.id = transaction_row.organisation_id
    left join public.private_listings listing on listing.id = transaction_row.listing_id
    left join public.units unit_row on unit_row.id = transaction_row.unit_id
   where transaction_row.id = any(v_ids)
     and (
       transaction_row.is_demo_data is true
       or coalesce(transaction_row.demo_metadata, '{}'::jsonb) <> '{}'::jsonb
       or buyer.is_demo_data is true
       or coalesce(buyer.demo_metadata, '{}'::jsonb) <> '{}'::jsonb
       or organisation.is_demo_data is true
       or listing.is_demo_data is true
       or coalesce(listing.demo_metadata, '{}'::jsonb) <> '{}'::jsonb
       or (
         (
           (lower(split_part(coalesce(buyer.email, ''), '@', 2)) in ('demo.bridgefinance.co.za', 'example.com', 'example.net', 'example.org', 'example.test', 'invalid', 'localhost'))::integer
           + (lower(split_part(coalesce(organisation.company_email, organisation.email, ''), '@', 2)) in ('demo.bridgefinance.co.za', 'example.com', 'example.net', 'example.org', 'example.test', 'invalid', 'localhost'))::integer
           + (lower(split_part(coalesce(transaction_row.assigned_agent_email, ''), '@', 2)) in ('demo.bridgefinance.co.za', 'example.com', 'example.net', 'example.org', 'example.test', 'invalid', 'localhost'))::integer
           + (lower(split_part(coalesce(transaction_row.assigned_attorney_email, ''), '@', 2)) in ('demo.bridgefinance.co.za', 'example.com', 'example.net', 'example.org', 'example.test', 'invalid', 'localhost'))::integer
           + (lower(split_part(coalesce(transaction_row.assigned_bond_originator_email, ''), '@', 2)) in ('demo.bridgefinance.co.za', 'example.com', 'example.net', 'example.org', 'example.test', 'invalid', 'localhost'))::integer
           + (coalesce(unit_row.notes, '') ~* '(demo|fixture|seed|test transaction|acceptance|full[-_ ]?e2e|bond[-_ ]?runtime)')::integer
           + (exists (
               select 1
               from public.transaction_role_players roleplayer
               where roleplayer.transaction_id = transaction_row.id
                 and (
                   roleplayer.is_demo_data is true
                   or lower(split_part(coalesce(roleplayer.email_address, ''), '@', 2)) in ('demo.bridgefinance.co.za', 'example.com', 'example.net', 'example.org', 'example.test', 'invalid', 'localhost')
                 )
             ))::integer
         ) >= 2
       )
     );

  if v_verified_count <> v_input_count then
    raise exception 'Database evidence did not independently verify every row as seed data; no rows were changed.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.transaction_quarantine_records record
    where record.transaction_id = any(v_ids)
      and record.restored_at is null
  ) then
    raise exception 'At least one transaction is already quarantined by another batch.' using errcode = '23505';
  end if;

  insert into public.transaction_quarantine_batches (
    classifier_version,
    report_digest,
    reason,
    operator_identifier,
    expected_record_count,
    status
  ) values (
    p_classifier_version,
    p_report_digest,
    btrim(p_reason),
    btrim(p_operator_identifier),
    p_expected_count,
    'processing'
  ) returning id into v_batch_id;

  insert into public.transaction_quarantine_records (
    batch_id,
    transaction_id,
    classification,
    confidence,
    classifier_evidence,
    original_transaction_state,
    original_buyer_portal_state,
    original_seller_portal_state,
    original_roleplayer_state,
    quarantined_at
  )
  select
    v_batch_id,
    transaction_row.id,
    'seed',
    'high',
    jsonb_build_object(
      'issues', coalesce(classification.row_data -> 'issues', '[]'::jsonb),
      'evidence', coalesce(classification.row_data -> 'evidence', '{}'::jsonb),
      'scope', coalesce(classification.row_data -> 'scope', '{}'::jsonb)
    ),
    jsonb_build_object(
      'isActive', transaction_row.is_active,
      'isDemoData', transaction_row.is_demo_data,
      'lifecycleState', transaction_row.lifecycle_state,
      'archivedAt', transaction_row.archived_at,
      'demoMetadata', transaction_row.demo_metadata
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', portal.id, 'isActive', portal.is_active) order by portal.id)
      from public.client_portal_links portal
      where portal.transaction_id = transaction_row.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', portal_context.id, 'status', portal_context.status) order by portal_context.id)
      from public.client_portal_contexts portal_context
      where portal_context.transaction_id = transaction_row.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', roleplayer.id,
        'status', roleplayer.status,
        'assignmentStatus', roleplayer.assignment_status,
        'removedAt', roleplayer.removed_at,
        'isDemoData', roleplayer.is_demo_data
      ) order by roleplayer.id)
      from public.transaction_role_players roleplayer
      where roleplayer.transaction_id = transaction_row.id
    ), '[]'::jsonb),
    v_now
  from public.transactions transaction_row
  join lateral (
    select row_data
    from jsonb_array_elements(p_classification_rows) row_data
    where (row_data ->> 'transactionId')::uuid = transaction_row.id
  ) classification on true
  where transaction_row.id = any(v_ids);

  update public.client_portal_links
     set is_active = false,
         updated_at = v_now
   where transaction_id = any(v_ids)
     and is_active is true;

  update public.client_portal_contexts
     set status = 'revoked',
         updated_at = v_now
   where transaction_id = any(v_ids)
     and status in ('active', 'pending');

  update public.transaction_role_players
     set status = 'removed',
         assignment_status = 'removed',
         removed_at = coalesce(removed_at, v_now),
         is_demo_data = true,
         updated_at = v_now
   where transaction_id = any(v_ids);

  update public.transactions
     set is_active = false,
         is_demo_data = true,
         lifecycle_state = 'archived',
         archived_at = coalesce(archived_at, v_now),
         quarantined_at = v_now,
         quarantine_batch_id = v_batch_id,
         quarantine_reason = btrim(p_reason),
         demo_metadata = coalesce(demo_metadata, '{}'::jsonb) || jsonb_build_object(
           'quarantinedSeed', true,
           'quarantineBatchId', v_batch_id,
           'classifierVersion', p_classifier_version,
           'reportDigest', p_report_digest
         ),
         updated_at = v_now
   where id = any(v_ids);

  insert into public.transaction_events (
    transaction_id,
    event_type,
    event_data,
    created_by_role,
    visibility_scope,
    is_demo_data
  )
  select
    transaction_id,
    'SeedTransactionQuarantined',
    jsonb_build_object(
      'batchId', v_batch_id,
      'classifierVersion', p_classifier_version,
      'reportDigest', p_report_digest,
      'reason', btrim(p_reason)
    ),
    'system',
    'internal',
    true
  from unnest(v_ids) transaction_id;

  update public.transaction_quarantine_batches
     set quarantined_record_count = v_input_count,
         status = 'completed',
         completed_at = v_now
   where id = v_batch_id;

  return jsonb_build_object(
    'batchId', v_batch_id,
    'status', 'completed',
    'quarantinedCount', v_input_count,
    'idempotentReplay', false
  );
end;
$$;

create or replace function public.bridge_restore_quarantined_seed_transactions(
  p_batch_id uuid,
  p_restore_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch public.transaction_quarantine_batches%rowtype;
  v_restored_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if current_user not in ('postgres', 'service_role')
     and coalesce(coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Seed transaction restore requires the service role.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_restore_reason, ''))) not between 8 and 500 then
    raise exception 'A meaningful restore reason is required.' using errcode = '22023';
  end if;

  select * into v_batch
    from public.transaction_quarantine_batches
   where id = p_batch_id
   for update;
  if not found then
    raise exception 'Quarantine batch not found.' using errcode = 'P0002';
  end if;
  if v_batch.status = 'restored' then
    return jsonb_build_object(
      'batchId', v_batch.id,
      'status', 'restored',
      'restoredCount', v_batch.quarantined_record_count,
      'idempotentReplay', true
    );
  end if;
  if v_batch.status <> 'completed' then
    raise exception 'Only completed quarantine batches can be restored.' using errcode = '55000';
  end if;

  perform transaction_row.id
    from public.transactions transaction_row
    join public.transaction_quarantine_records record on record.transaction_id = transaction_row.id
   where record.batch_id = p_batch_id
     and record.restored_at is null
   order by transaction_row.id
   for update;

  update public.transactions transaction_row
     set is_active = coalesce((record.original_transaction_state ->> 'isActive')::boolean, true),
         is_demo_data = coalesce((record.original_transaction_state ->> 'isDemoData')::boolean, false),
         lifecycle_state = nullif(record.original_transaction_state ->> 'lifecycleState', ''),
         archived_at = (record.original_transaction_state ->> 'archivedAt')::timestamptz,
         demo_metadata = coalesce(record.original_transaction_state -> 'demoMetadata', '{}'::jsonb),
         quarantined_at = null,
         quarantine_batch_id = null,
         quarantine_reason = null,
         updated_at = v_now
    from public.transaction_quarantine_records record
   where record.batch_id = p_batch_id
     and record.restored_at is null
     and transaction_row.id = record.transaction_id
     and transaction_row.quarantine_batch_id = p_batch_id;
  get diagnostics v_restored_count = row_count;

  update public.client_portal_links portal
     set is_active = coalesce((snapshot.row_data ->> 'isActive')::boolean, false),
         updated_at = v_now
    from public.transaction_quarantine_records record
    cross join lateral jsonb_array_elements(record.original_buyer_portal_state) snapshot(row_data)
   where record.batch_id = p_batch_id
     and portal.id = (snapshot.row_data ->> 'id')::uuid;

  update public.client_portal_contexts portal_context
     set status = snapshot.row_data ->> 'status',
         updated_at = v_now
    from public.transaction_quarantine_records record
    cross join lateral jsonb_array_elements(record.original_seller_portal_state) snapshot(row_data)
   where record.batch_id = p_batch_id
     and portal_context.id = (snapshot.row_data ->> 'id')::uuid;

  update public.transaction_role_players roleplayer
     set status = snapshot.row_data ->> 'status',
         assignment_status = snapshot.row_data ->> 'assignmentStatus',
         removed_at = (snapshot.row_data ->> 'removedAt')::timestamptz,
         is_demo_data = coalesce((snapshot.row_data ->> 'isDemoData')::boolean, false),
         updated_at = v_now
    from public.transaction_quarantine_records record
    cross join lateral jsonb_array_elements(record.original_roleplayer_state) snapshot(row_data)
   where record.batch_id = p_batch_id
     and roleplayer.id = (snapshot.row_data ->> 'id')::uuid;

  update public.transaction_quarantine_records
     set restored_at = v_now
   where batch_id = p_batch_id
     and restored_at is null;

  update public.transaction_quarantine_batches
     set status = 'restored',
         restored_at = v_now,
         restore_reason = btrim(p_restore_reason)
   where id = p_batch_id;

  insert into public.transaction_events (
    transaction_id,
    event_type,
    event_data,
    created_by_role,
    visibility_scope,
    is_demo_data
  )
  select
    record.transaction_id,
    'SeedTransactionQuarantineRestored',
    jsonb_build_object('batchId', p_batch_id, 'reason', btrim(p_restore_reason)),
    'system',
    'internal',
    coalesce((record.original_transaction_state ->> 'isDemoData')::boolean, false)
  from public.transaction_quarantine_records record
  where record.batch_id = p_batch_id;

  return jsonb_build_object(
    'batchId', p_batch_id,
    'status', 'restored',
    'restoredCount', v_restored_count,
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.bridge_quarantine_seed_transactions(jsonb, text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.bridge_restore_quarantined_seed_transactions(uuid, text)
  from public, anon, authenticated;
grant execute on function public.bridge_quarantine_seed_transactions(jsonb, text, text, text, text, integer)
  to service_role;
grant execute on function public.bridge_restore_quarantined_seed_transactions(uuid, text)
  to service_role;

commit;
