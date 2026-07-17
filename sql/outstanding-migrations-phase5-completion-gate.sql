-- Phase 5 is read-only. It verifies resolved raw-ledger rows and keeps the
-- standalone security migration explicitly outside the completion set.
with expected(version, name) as (
  values
    ('202606010001', 'partner_routing_rules_phase1'),
    ('202606030007', 'lead_communication_events'),
    ('202606030008', 'lead_listing_suggestions'),
    ('202606030009', 'lead_recommendations'),
    ('202606030010', 'lead_saved_searches'),
    ('202606030011', 'communication_delivery_preferences'),
    ('202606040001', 'onboarding_role_contract_phase2'),
    ('202606040002', 'workspace_entitlements_phase4'),
    ('202606040004', 'workspace_entitlement_enforcement_phase5'),
    ('202606040005', 'workspace_billing_operations_phase6'),
    ('202606050001', 'bond_bank_relationship_profiles'),
    ('202606080002', 'commercial_listings_foundation'),
    ('202606090010', 'created_by_access_remediation'),
    ('202606110004', 'commercial_transactions_phase2'),
    ('202606110005', 'commercial_crm_foundation_phase3'),
    ('202606110006', 'commercial_supply_side_phase4'),
    ('202606110007', 'commercial_brokerage_os_phase5'),
    ('202607050001', 'bond_grant_workflow_milestones')
), ledger_gate as (
  select
    count(*)::integer as expected_count,
    count(ledger.version)::integer as exact_live_count,
    coalesce(
      jsonb_agg(jsonb_build_object('version', expected.version, 'name', expected.name) order by expected.version)
        filter (where ledger.version is null),
      '[]'::jsonb
    ) as missing
  from expected
  left join supabase_migrations.schema_migrations ledger
    on ledger.version = expected.version
   and ledger.name = expected.name
)
select
  ledger_gate.expected_count,
  ledger_gate.exact_live_count,
  ledger_gate.missing,
  ledger_gate.expected_count = ledger_gate.exact_live_count as resolved_history_complete,
  not exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '202607070001'
  ) as security_migration_isolated,
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and policyname like '%!_demo!_all' escape '!'
  ) as legacy_demo_policy_count
from ledger_gate;
