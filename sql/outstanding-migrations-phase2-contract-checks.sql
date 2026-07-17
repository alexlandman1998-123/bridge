-- Phase 2 is catalog-only. It does not change application data or schema.

with expected_columns(table_name, column_name) as (
  values
    ('bond_banks', 'contact_name'),
    ('bond_banks', 'contact_email'),
    ('bond_banks', 'contact_phone'),
    ('bond_banks', 'next_review_date'),
    ('bond_banks', 'relationship_notes'),
    ('transaction_bond_instructions', 'grant_received'),
    ('transaction_bond_instructions', 'grant_received_at'),
    ('transaction_bond_instructions', 'grant_received_by'),
    ('transaction_bond_instructions', 'grant_document_id'),
    ('transaction_bond_instructions', 'grant_signed'),
    ('transaction_bond_instructions', 'grant_signed_at'),
    ('transaction_bond_instructions', 'grant_signed_by'),
    ('transaction_bond_instructions', 'signed_grant_document_id'),
    ('transaction_bond_instructions', 'grant_submitted'),
    ('transaction_bond_instructions', 'grant_submitted_at'),
    ('transaction_bond_instructions', 'grant_submitted_by')
)
select
  'column_contracts' as check_name,
  count(*)::integer as expected_count,
  count(column_row.column_name)::integer as live_count,
  array_agg(expected.table_name || '.' || expected.column_name order by expected.table_name, expected.column_name)
    filter (where column_row.column_name is null) as missing
from expected_columns expected
left join information_schema.columns column_row
  on column_row.table_schema = 'public'
 and column_row.table_name = expected.table_name
 and column_row.column_name = expected.column_name;

with expected_policies(policy_name) as (
  values
    ('private_listings_support_role_select'),
    ('private_listings_support_role_update'),
    ('private_listings_delete_member_owner')
)
select
  'access_remediation_missing_contracts' as check_name,
  jsonb_build_object(
    'commercialAccessFunction', to_regprocedure('public.bridge_commercial_can_access_record(uuid,uuid,uuid,uuid,uuid)') is not null,
    'privateListingAccessFunction', to_regprocedure('public.bridge_can_access_private_listing(uuid)') is not null,
    'transactionSpineAccessFunction', to_regprocedure('public.bridge_can_access_transaction_spine(uuid)') is not null,
    'missingPolicies', coalesce((
      select jsonb_agg(expected.policy_name order by expected.policy_name)
      from expected_policies expected
      where not exists (
        select 1 from pg_policies policy
        where policy.schemaname = 'public'
          and policy.policyname = expected.policy_name
      )
    ), '[]'::jsonb)
  ) as result;

with legacy_tables(table_name) as (
  values
    ('profiles'), ('firms'), ('firm_memberships'), ('developments'), ('units'),
    ('buyers'), ('transactions'), ('transaction_finance_details'), ('transaction_subprocesses'),
    ('transaction_subprocess_steps'), ('transaction_onboarding'), ('onboarding_form_data'),
    ('document_groups'), ('document_templates'), ('document_requirement_rules'),
    ('transaction_required_documents'), ('transaction_participants'), ('transaction_comments'),
    ('transaction_status_links'), ('transaction_events'), ('transaction_readiness_states'),
    ('transaction_notifications'), ('transaction_external_access'), ('document_request_groups'),
    ('document_requests'), ('transaction_checklist_items'), ('transaction_issue_overrides'),
    ('development_settings'), ('development_attorney_configs'),
    ('development_attorney_required_closeout_docs'), ('transaction_attorney_closeouts'),
    ('transaction_attorney_closeout_documents'), ('development_bond_configs'),
    ('development_bond_required_closeout_docs'), ('transaction_bond_closeouts'),
    ('transaction_bond_closeout_documents'), ('client_portal_links'), ('client_portal_contexts'),
    ('client_seller_interest_requests'), ('client_issues'), ('alteration_requests'),
    ('service_reviews'), ('trust_investment_forms'), ('transaction_handover'), ('snapshot_links'),
    ('notes'), ('documents'), ('document_requirements')
), findings as (
  select 'demo_policy'::text as finding_type, policy.tablename as table_name, policy.policyname as detail
  from pg_policies policy
  where policy.schemaname = 'public'
    and policy.policyname like '%!_demo!_all' escape '!'

  union all

  select 'anon_table_grant', grant_row.table_name, grant_row.privilege_type
  from information_schema.role_table_grants grant_row
  join legacy_tables legacy on legacy.table_name = grant_row.table_name
  where grant_row.table_schema = 'public'
    and grant_row.grantee = 'anon'

  union all

  select 'authenticated_write_grant', grant_row.table_name, grant_row.privilege_type
  from information_schema.role_table_grants grant_row
  join legacy_tables legacy on legacy.table_name = grant_row.table_name
  where grant_row.table_schema = 'public'
    and grant_row.grantee = 'authenticated'
    and grant_row.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
)
select
  'legacy_demo_access' as check_name,
  count(*)::integer as finding_count,
  count(*) filter (where finding_type = 'demo_policy')::integer as demo_policy_count,
  count(*) filter (where finding_type = 'anon_table_grant')::integer as anon_table_grant_count,
  count(*) filter (where finding_type = 'authenticated_write_grant')::integer as authenticated_write_grant_count,
  count(distinct table_name) filter (where finding_type <> 'demo_policy')::integer as affected_table_count
from findings;
