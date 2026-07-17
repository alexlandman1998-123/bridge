-- Read-only assurance gate for migration 202607050001.
with expected_columns(column_name, data_type, is_nullable, expected_default) as (
  values
    ('grant_received', 'boolean', 'NO', 'false'),
    ('grant_received_at', 'timestamp with time zone', 'YES', null),
    ('grant_received_by', 'uuid', 'YES', null),
    ('grant_document_id', 'uuid', 'YES', null),
    ('grant_signed', 'boolean', 'NO', 'false'),
    ('grant_signed_at', 'timestamp with time zone', 'YES', null),
    ('grant_signed_by', 'uuid', 'YES', null),
    ('signed_grant_document_id', 'uuid', 'YES', null),
    ('grant_submitted', 'boolean', 'NO', 'false'),
    ('grant_submitted_at', 'timestamp with time zone', 'YES', null),
    ('grant_submitted_by', 'uuid', 'YES', null)
), column_gate as (
  select
    count(*)::integer as expected_count,
    count(columns.column_name)::integer as exact_count,
    coalesce(
      jsonb_agg(expected_columns.column_name order by expected_columns.column_name)
        filter (
          where columns.column_name is null
             or columns.data_type <> expected_columns.data_type
             or columns.is_nullable <> expected_columns.is_nullable
             or coalesce(columns.column_default, '') <> coalesce(expected_columns.expected_default, '')
        ),
      '[]'::jsonb
    ) as mismatches
  from expected_columns
  left join information_schema.columns columns
    on columns.table_schema = 'public'
   and columns.table_name = 'transaction_bond_instructions'
   and columns.column_name = expected_columns.column_name
   and columns.data_type = expected_columns.data_type
   and columns.is_nullable = expected_columns.is_nullable
   and coalesce(columns.column_default, '') = coalesce(expected_columns.expected_default, '')
), expected_indexes(index_name, required_fragment) as (
  values
    ('transaction_bond_instructions_grant_received_idx', 'where (grant_received = true)'),
    ('transaction_bond_instructions_grant_submitted_idx', 'where (grant_submitted = true)')
), index_gate as (
  select
    count(indexes.indexname)::integer as exact_count,
    coalesce(
      jsonb_agg(expected_indexes.index_name order by expected_indexes.index_name)
        filter (where indexes.indexname is null),
      '[]'::jsonb
    ) as mismatches
  from expected_indexes
  left join pg_indexes indexes
    on indexes.schemaname = 'public'
   and indexes.tablename = 'transaction_bond_instructions'
   and indexes.indexname = expected_indexes.index_name
   and lower(indexes.indexdef) like '%' || expected_indexes.required_fragment || '%'
), expected_constraints(table_name, constraint_name, required_terms) as (
  values
    (
      'transaction_finance_workflows',
      'transaction_finance_workflows_stage_check',
      array['grant_received', 'grant_signed', 'grant_submitted']::text[]
    ),
    (
      'transaction_finance_workflow_events',
      'transaction_finance_workflow_events_to_stage_check',
      array['grant_received', 'grant_signed', 'grant_submitted']::text[]
    ),
    (
      'transaction_finance_workflow_events',
      'transaction_finance_workflow_events_from_stage_check',
      array['grant_received', 'grant_signed', 'grant_submitted']::text[]
    ),
    (
      'transaction_finance_workflow_events',
      'transaction_finance_workflow_events_type_check',
      array['grant_received', 'grant_signed', 'grant_submitted']::text[]
    )
), constraint_catalog as (
  select
    relation.relname as table_name,
    constraint_row.conname as constraint_name,
    lower(pg_get_constraintdef(constraint_row.oid)) as definition
  from pg_constraint constraint_row
  join pg_class relation on relation.oid = constraint_row.conrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and constraint_row.contype = 'c'
), constraint_gate as (
  select
    count(constraint_catalog.constraint_name)::integer as exact_count,
    coalesce(
      jsonb_agg(expected_constraints.constraint_name order by expected_constraints.constraint_name)
        filter (where constraint_catalog.constraint_name is null),
      '[]'::jsonb
    ) as mismatches
  from expected_constraints
  left join constraint_catalog
    on constraint_catalog.table_name = expected_constraints.table_name
   and constraint_catalog.constraint_name = expected_constraints.constraint_name
   and constraint_catalog.definition like all (
     select '%' || required_term || '%'
     from unnest(expected_constraints.required_terms) required_term
   )
), expected_foreign_keys(column_name, referenced_table) as (
  values
    ('grant_received_by', 'profiles'),
    ('grant_document_id', 'documents'),
    ('grant_signed_by', 'profiles'),
    ('signed_grant_document_id', 'documents'),
    ('grant_submitted_by', 'profiles')
), foreign_key_catalog as (
  select
    source_attribute.attname as column_name,
    target_relation.relname as referenced_table,
    constraint_row.confdeltype
  from pg_constraint constraint_row
  join pg_class source_relation on source_relation.oid = constraint_row.conrelid
  join pg_namespace source_namespace on source_namespace.oid = source_relation.relnamespace
  join pg_class target_relation on target_relation.oid = constraint_row.confrelid
  join pg_attribute source_attribute
    on source_attribute.attrelid = constraint_row.conrelid
   and source_attribute.attnum = constraint_row.conkey[1]
  where source_namespace.nspname = 'public'
    and source_relation.relname = 'transaction_bond_instructions'
    and constraint_row.contype = 'f'
), foreign_key_gate as (
  select
    count(foreign_key_catalog.column_name)::integer as exact_count,
    coalesce(
      jsonb_agg(expected_foreign_keys.column_name order by expected_foreign_keys.column_name)
        filter (where foreign_key_catalog.column_name is null),
      '[]'::jsonb
    ) as mismatches
  from expected_foreign_keys
  left join foreign_key_catalog
    on foreign_key_catalog.column_name = expected_foreign_keys.column_name
   and foreign_key_catalog.referenced_table = expected_foreign_keys.referenced_table
   and foreign_key_catalog.confdeltype = 'n'
), data_integrity as (
  select
    count(*) filter (where grant_signed and not grant_received)::integer as signed_before_received,
    count(*) filter (where grant_submitted and not grant_signed)::integer as submitted_before_signed,
    count(*) filter (where grant_received <> (grant_received_at is not null))::integer as received_timestamp_mismatch,
    count(*) filter (where grant_signed <> (grant_signed_at is not null))::integer as signed_timestamp_mismatch,
    count(*) filter (where grant_submitted <> (grant_submitted_at is not null))::integer as submitted_timestamp_mismatch
  from public.transaction_bond_instructions
), ledger_gate as (
  select exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '202607050001'
      and name = 'bond_grant_workflow_milestones'
  ) as exact_row_exists
)
select
  column_gate.expected_count as expected_column_count,
  column_gate.exact_count as exact_column_count,
  column_gate.mismatches as column_mismatches,
  index_gate.exact_count as exact_index_count,
  index_gate.mismatches as index_mismatches,
  constraint_gate.exact_count as exact_constraint_count,
  constraint_gate.mismatches as constraint_mismatches,
  foreign_key_gate.exact_count as exact_foreign_key_count,
  foreign_key_gate.mismatches as foreign_key_mismatches,
  ledger_gate.exact_row_exists as exact_ledger_row_exists,
  data_integrity.signed_before_received,
  data_integrity.submitted_before_signed,
  data_integrity.received_timestamp_mismatch,
  data_integrity.signed_timestamp_mismatch,
  data_integrity.submitted_timestamp_mismatch,
  (
    column_gate.exact_count = column_gate.expected_count
    and index_gate.exact_count = 2
    and constraint_gate.exact_count = 4
    and foreign_key_gate.exact_count = 5
    and ledger_gate.exact_row_exists
  ) as schema_contract_complete
from column_gate, index_gate, constraint_gate, foreign_key_gate, data_integrity, ledger_gate;
