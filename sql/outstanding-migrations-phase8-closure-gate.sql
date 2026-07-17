-- Read-only final closure gate for the historical migration reconciliation.
with expected_history(version, name) as (
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
    ('202607050001', 'bond_grant_workflow_milestones'),
    ('202607070001', 'drop_demo_all_rls_grants')
), history_gate as (
  select
    count(*)::integer as expected_count,
    count(ledger.version)::integer as exact_count,
    coalesce(
      jsonb_agg(
        jsonb_build_object('version', expected_history.version, 'name', expected_history.name)
        order by expected_history.version
      ) filter (where ledger.version is null),
      '[]'::jsonb
    ) as missing
  from expected_history
  left join supabase_migrations.schema_migrations ledger
    on ledger.version = expected_history.version
   and ledger.name = expected_history.name
), successor_gate as (
  select exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '202607140018'
      and name = 'legacy_demo_rls_scoped_replacement'
  ) as scoped_security_successor_exists
), policy_gate as (
  select count(*)::integer as unrestricted_policy_count
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
)
select
  history_gate.expected_count as expected_reconciled_history_count,
  history_gate.exact_count as exact_reconciled_history_count,
  history_gate.missing,
  successor_gate.scoped_security_successor_exists,
  policy_gate.unrestricted_policy_count,
  (
    history_gate.expected_count = history_gate.exact_count
    and history_gate.missing = '[]'::jsonb
    and successor_gate.scoped_security_successor_exists
    and policy_gate.unrestricted_policy_count = 0
  ) as closure_complete
from history_gate, successor_gate, policy_gate;
