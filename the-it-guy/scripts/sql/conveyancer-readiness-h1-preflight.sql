-- Read-only H1 schema and migration preflight. This script does not mutate data.

with expected_columns(column_name, data_type, nullable) as (
  values
    ('property_tenure', 'text', true),
    ('seller_type', 'text', true),
    ('existing_bond', 'boolean', false),
    ('cancellation_required', 'boolean', false),
    ('vat_treatment', 'text', true),
    ('routing_profile_version', 'text', true),
    ('routing_profile_json', 'jsonb', false)
),
actual_columns as (
  select column_name, data_type, is_nullable = 'YES' as nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'transactions'
),
expected_tables(table_name) as (
  values
    ('conveyancer_matter_plans'), ('conveyancer_action_events'), ('conveyancer_exceptions'),
    ('conveyancer_exception_events'), ('conveyancer_document_artifacts'), ('conveyancer_signing_records'),
    ('conveyancer_financial_models'), ('conveyancer_financial_events'), ('conveyancer_coordinations'),
    ('conveyancer_evidence'), ('conveyancer_evidence_reviews'), ('conveyancer_integration_profiles'),
    ('conveyancer_integration_events'), ('conveyancer_assurance_reports'), ('conveyancer_audit_events')
),
table_security as (
  select c.relname as table_name, c.relrowsecurity as rls_enabled,
    (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policy_count,
    exists (
      select 1 from pg_trigger t
      where t.tgrelid = c.oid and not t.tgisinternal
        and pg_get_triggerdef(t.oid) ilike '%bridge_conveyancer_reject_mutation%'
    ) as immutable_trigger
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
expected_functions(function_name) as (
  values
    ('bridge_conveyancer_can_access_record'), ('bridge_set_conveyancer_orchestration_control'),
    ('bridge_apply_conveyancer_orchestration_batch'), ('bridge_set_conveyancer_notification_control'),
    ('bridge_enqueue_conveyancer_document_job'), ('bridge_set_conveyancer_provider_runtime_control'),
    ('bridge_set_conveyancer_provider_transport_control'), ('bridge_set_conveyancer_provider_kill_switch'),
    ('bridge_rollback_conveyancer_release')
),
function_inventory as (
  select p.proname as function_name
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
index_inventory as (
  select indexname from pg_indexes where schemaname = 'public' and tablename = 'transactions'
),
migration_history as (
  select version from supabase_migrations.schema_migrations order by version
)
select jsonb_build_object(
  'columns', (select coalesce(jsonb_agg(jsonb_build_object('name', e.column_name, 'expectedType', e.data_type, 'expectedNullable', e.nullable, 'actualType', a.data_type, 'actualNullable', a.nullable, 'present', a.column_name is not null) order by e.column_name), '[]'::jsonb) from expected_columns e left join actual_columns a using (column_name)),
  'tables', (select coalesce(jsonb_agg(jsonb_build_object('name', e.table_name, 'present', s.table_name is not null, 'rlsEnabled', coalesce(s.rls_enabled, false), 'policyCount', coalesce(s.policy_count, 0), 'immutableTrigger', coalesce(s.immutable_trigger, false)) order by e.table_name), '[]'::jsonb) from expected_tables e left join table_security s using (table_name)),
  'indexes', (select coalesce(jsonb_agg(indexname order by indexname), '[]'::jsonb) from index_inventory where indexname in ('transactions_routing_profile_version_idx', 'transactions_routing_attention_idx')),
  'functions', (select coalesce(jsonb_agg(e.function_name order by e.function_name) filter (where f.function_name is not null), '[]'::jsonb) from expected_functions e left join function_inventory f using (function_name)),
  'migrationVersions', (select coalesce(jsonb_agg(version order by version), '[]'::jsonb) from migration_history)
) as conveyancer_h1_preflight;
