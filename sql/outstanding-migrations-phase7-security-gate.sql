-- Read-only security and supersession gate for migration 202607070001.
with legacy_tables(table_name) as (
  values
    ('profiles'),
    ('firms'),
    ('firm_memberships'),
    ('developments'),
    ('units'),
    ('buyers'),
    ('transactions'),
    ('transaction_finance_details'),
    ('transaction_subprocesses'),
    ('transaction_subprocess_steps'),
    ('transaction_onboarding'),
    ('onboarding_form_data'),
    ('document_groups'),
    ('document_templates'),
    ('document_requirement_rules'),
    ('transaction_required_documents'),
    ('transaction_participants'),
    ('transaction_comments'),
    ('transaction_status_links'),
    ('transaction_events'),
    ('transaction_readiness_states'),
    ('transaction_notifications'),
    ('transaction_external_access'),
    ('document_request_groups'),
    ('document_requests'),
    ('transaction_checklist_items'),
    ('transaction_issue_overrides'),
    ('development_settings'),
    ('development_attorney_configs'),
    ('development_attorney_required_closeout_docs'),
    ('transaction_attorney_closeouts'),
    ('transaction_attorney_closeout_documents'),
    ('development_bond_configs'),
    ('development_bond_required_closeout_docs'),
    ('transaction_bond_closeouts'),
    ('transaction_bond_closeout_documents'),
    ('client_portal_links'),
    ('client_portal_contexts'),
    ('client_seller_interest_requests'),
    ('client_issues'),
    ('alteration_requests'),
    ('service_reviews'),
    ('trust_investment_forms'),
    ('transaction_handover'),
    ('snapshot_links'),
    ('notes'),
    ('documents'),
    ('document_requirements')
), live_legacy_tables as (
  select legacy_tables.table_name, relation.oid, relation.relrowsecurity
  from legacy_tables
  join pg_class relation on relation.relname = legacy_tables.table_name
  join pg_namespace namespace
    on namespace.oid = relation.relnamespace
   and namespace.nspname = 'public'
  where relation.relkind in ('r', 'p')
), policy_coverage as (
  select
    live_legacy_tables.table_name,
    live_legacy_tables.relrowsecurity,
    count(policies.policyname)::integer as policy_count
  from live_legacy_tables
  left join pg_policies policies
    on policies.schemaname = 'public'
   and policies.tablename = live_legacy_tables.table_name
  group by live_legacy_tables.table_name, live_legacy_tables.relrowsecurity
), expected_successor_policies(policy_name) as (
  values
    ('document_groups_select_scoped'),
    ('document_groups_admin_insert'),
    ('document_groups_admin_update'),
    ('document_groups_admin_delete'),
    ('document_templates_select_scoped'),
    ('document_templates_admin_insert'),
    ('document_templates_admin_update'),
    ('document_templates_admin_delete'),
    ('document_requirements_select_scoped'),
    ('document_requirements_insert_scoped'),
    ('document_requirements_update_scoped'),
    ('document_requirements_delete_scoped'),
    ('document_request_groups_select_scoped'),
    ('document_request_groups_insert_scoped'),
    ('document_request_groups_update_scoped'),
    ('document_request_groups_delete_scoped'),
    ('firms_authenticated_select'),
    ('firms_admin_insert'),
    ('firms_firm_admin_update'),
    ('firms_firm_admin_delete'),
    ('firm_memberships_select_scoped'),
    ('firm_memberships_admin_insert'),
    ('firm_memberships_admin_update'),
    ('firm_memberships_admin_delete'),
    ('transaction_issue_overrides_select_scoped'),
    ('transaction_issue_overrides_insert_scoped'),
    ('transaction_issue_overrides_update_scoped'),
    ('transaction_issue_overrides_delete_scoped')
), successor_policy_gate as (
  select
    count(policies.policyname)::integer as exact_count,
    coalesce(
      jsonb_agg(expected_successor_policies.policy_name order by expected_successor_policies.policy_name)
        filter (where policies.policyname is null),
      '[]'::jsonb
    ) as missing
  from expected_successor_policies
  left join pg_policies policies
    on policies.schemaname = 'public'
   and policies.policyname = expected_successor_policies.policy_name
), unrestricted_policy_gate as (
  select count(*)::integer as finding_count
  from pg_policies
  where schemaname = 'public'
    and (
      policyname like '%!_demo!_all' escape '!'
      or policyname in (
        'Allow all read buyers', 'Allow all write buyers',
        'Allow all read documents', 'Allow all write documents',
        'Allow all read notes', 'Allow all write notes',
        'Allow all read units', 'Allow all write units'
      )
    )
), retained_grants as (
  select
    count(*) filter (where grants.grantee = 'anon')::integer as anon_grant_count,
    count(*) filter (
      where grants.grantee = 'authenticated'
        and grants.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
    )::integer as authenticated_write_grant_count
  from information_schema.role_table_grants grants
  join legacy_tables on legacy_tables.table_name = grants.table_name
  where grants.table_schema = 'public'
), ledger_gate as (
  select
    exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = '202607140018'
        and name = 'legacy_demo_rls_scoped_replacement'
    ) as successor_row_exists,
    exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = '202607070001'
        and name = 'drop_demo_all_rls_grants'
    ) as historical_row_exists
), function_gate as (
  select to_regprocedure('public.bridge_has_legacy_firm_membership(uuid,boolean)') is not null
    as successor_helper_exists
), aggregate_gate as (
  select
    (select count(*)::integer from legacy_tables) as expected_table_count,
    (select count(*)::integer from live_legacy_tables) as live_table_count,
    coalesce(
      (
        select jsonb_agg(legacy_tables.table_name order by legacy_tables.table_name)
        from legacy_tables
        left join live_legacy_tables using (table_name)
        where live_legacy_tables.table_name is null
      ),
      '[]'::jsonb
    ) as missing_legacy_tables,
    coalesce(
      (select jsonb_agg(table_name order by table_name) from policy_coverage where not relrowsecurity),
      '[]'::jsonb
    ) as rls_disabled_tables,
    coalesce(
      (select jsonb_agg(table_name order by table_name) from policy_coverage where policy_count = 0),
      '[]'::jsonb
    ) as tables_without_policies
)
select
  aggregate_gate.expected_table_count,
  aggregate_gate.live_table_count,
  aggregate_gate.missing_legacy_tables,
  aggregate_gate.rls_disabled_tables,
  aggregate_gate.tables_without_policies,
  successor_policy_gate.exact_count as exact_successor_policy_count,
  successor_policy_gate.missing as missing_successor_policies,
  unrestricted_policy_gate.finding_count as unrestricted_policy_count,
  retained_grants.anon_grant_count,
  retained_grants.authenticated_write_grant_count,
  ledger_gate.successor_row_exists,
  ledger_gate.historical_row_exists,
  function_gate.successor_helper_exists,
  (
    aggregate_gate.live_table_count > 0
    and aggregate_gate.rls_disabled_tables = '[]'::jsonb
    and aggregate_gate.tables_without_policies = '[]'::jsonb
    and successor_policy_gate.exact_count = 28
    and unrestricted_policy_gate.finding_count = 0
    and ledger_gate.successor_row_exists
    and function_gate.successor_helper_exists
  ) as safe_to_reconcile_history
from aggregate_gate, successor_policy_gate, unrestricted_policy_gate,
  retained_grants, ledger_gate, function_gate;
