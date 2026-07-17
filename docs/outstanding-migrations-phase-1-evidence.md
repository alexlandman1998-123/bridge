# Outstanding migrations — Phase 1 evidence capture

Generated: 2026-07-17

## Scope and safety

This phase was read-only against the linked database. It refreshed the migration ledger and live-object catalogue after the controlled July 17 deployment. It did not execute migration SQL, repair migration history, reset the database, or mutate application data.

## Ledger snapshot

| Metric | Result |
| --- | ---: |
| Matched local/remote migrations | 400 |
| Local-only migrations | 19 |
| Remote-only migrations | 0 |
| Duplicate local timestamps | 0 |

The detailed ledger and object evidence is recorded in:

- `docs/supabase-migration-phase-5-module-drift-report.md`
- `docs/supabase-migration-phase-6-split-ledger-investigation-report.md`

## Live-object inventory

The Phase 5 catalogue audit extracted and checked 234 static database objects from the 19 remaining migration files.

| Classification | Count | Decision |
| --- | ---: | --- |
| All declared static objects live | 16 migrations | Candidate for later ledger-only repair after module smoke evidence |
| Partially live | 1 migration | Create a forward-only reconciliation migration; do not repair yet |
| No static objects extractable | 2 migrations | Manual SQL and runtime review required |

### Partial migration

- `202606090010_created_by_access_remediation.sql`: 27 of 30 declared objects are live.

### Manual-review migrations

- `202606050001_bond_bank_relationship_profiles.sql`
- `202607070001_drop_demo_all_rls_grants.sql`

### All-live candidates

- `202606010001_partner_routing_rules_phase1.sql`
- `202606030007_lead_communication_events.sql`
- `202606030008_lead_listing_suggestions.sql`
- `202606030009_lead_recommendations.sql`
- `202606030010_lead_saved_searches.sql`
- `202606030011_communication_delivery_preferences.sql`
- `202606040001_onboarding_role_contract_phase2.sql`
- `202606040002_workspace_entitlements_phase4.sql`
- `202606040004_workspace_entitlement_enforcement_phase5.sql`
- `202606040005_workspace_billing_operations_phase6.sql`
- `202606080002_commercial_listings_foundation.sql`
- `202606110004_commercial_transactions_phase2.sql`
- `202606110005_commercial_crm_foundation_phase3.sql`
- `202606110006_commercial_supply_side_phase4.sql`
- `202606110007_commercial_brokerage_os_phase5.sql`
- `202607050001_bond_grant_workflow_milestones.sql`

Object presence alone is not sufficient evidence for ledger repair. Each functional group still requires its module smoke suite and, where practical, definition-level comparison.

## Recoverability assessment

The Supabase backup API reported:

| Control | Result |
| --- | --- |
| WAL-G enabled | Yes |
| Point-in-time recovery | No |
| Listed physical backups | 0 |
| Local schema dump | Failed because Docker Desktop is unavailable |

Phase 1 therefore has a recovery blocker. Before any later phase applies data-changing or destructive SQL, enable/confirm a recoverable Supabase backup or produce and verify an external logical backup. A schema-only dump is still recommended for DDL rollback evidence once Docker or a compatible `pg_dump` runtime is available.

## Current gate

**Status: EVIDENCE_CAPTURED_RECOVERY_BLOCKED**

The ledger and catalogue inventory are current, but Phase 2 should remain read-only until recoverability is established. The 16 all-live entries may be prepared in small module-specific ledger-repair batches; the partial and manual-review entries must stay excluded.

## Commands executed

```sh
npm run supabase:phase5
npm run supabase:phase6
npx supabase backups list --output-format json
npx supabase db dump --linked --schema public --file migration-evidence/2026-07-17-phase1/public-schema.sql
```

The Phase 6 command exited non-zero because the current CLI ledger contains no rows classified as split-version pairs; its report was retained as evidence. The schema dump created no usable snapshot because Docker was unavailable.
