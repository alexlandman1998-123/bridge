# Outstanding migrations — Phase 2 contract audit

Generated: 2026-07-17

## Scope and safety

Phase 2 was read-only against the linked database. It refreshed live catalogue evidence, ran targeted column/function/policy/grant checks, and executed local module contract suites. It did not execute migration SQL or modify migration history.

Recovery remains blocked: PITR is disabled and no physical backup is listed. Consequently, the Phase 3 handoff below is a planning classification only.

## Classification result

| Classification | Count | Meaning |
| --- | ---: | --- |
| `EXACTLY_LIVE` | 17 | The declared static contract is present, targeted non-static checks passed where required, and the relevant local contract suite passed |
| `LIVE_WITH_DRIFT` | 0 | No migration was placed in this bucket from current evidence |
| `PARTIALLY_LIVE` | 2 | Some intended effects are present and some are missing |
| `NOT_LIVE` | 0 | No remaining migration was wholly absent |

`EXACTLY_LIVE` here means contract-equivalent for ledger-repair planning; it does not mean byte-for-byte equality with the historical SQL text. Later migrations may legitimately supersede function or policy definitions.

## Functional-group matrix

### Transaction network — `EXACTLY_LIVE`

- `202606010001_partner_routing_rules_phase1.sql`
- Static objects: 15/15 live.
- Contract evidence: partner business-distribution service tests passed.

### Lead capture and CRM — `EXACTLY_LIVE`

- `202606030007_lead_communication_events.sql`
- `202606030008_lead_listing_suggestions.sql`
- `202606030009_lead_recommendations.sql`
- `202606030010_lead_saved_searches.sql`
- Static objects: 44/44 live across the four migrations.
- Contract evidence: lead communication, suggestions, and recommendations tests passed. The saved-search schema remains covered by the live catalogue audit; no dedicated saved-search test exists.

### Notification automation — `EXACTLY_LIVE`

- `202606030011_communication_delivery_preferences.sql`
- Static objects: 19/19 live.
- Contract evidence: the communication contract suite passed through the shared lead-communication flow.

### Workspace platform — `EXACTLY_LIVE`

- `202606040001_onboarding_role_contract_phase2.sql`
- `202606040002_workspace_entitlements_phase4.sql`
- `202606040004_workspace_entitlement_enforcement_phase5.sql`
- `202606040005_workspace_billing_operations_phase6.sql`
- Static objects: 46/46 live.
- Contract evidence: workspace entitlement Phases 4–5 and billing Phases 6–7 passed.

### Bond — `EXACTLY_LIVE`

- `202606050001_bond_bank_relationship_profiles.sql`
  - All five expected `bond_banks` relationship columns are live.
- `202607050001_bond_grant_workflow_milestones.sql`
  - All eleven grant-milestone columns and all six statically declared objects are live.
- Contract evidence: bond bank relationship tests passed; the broader bond workflow stage contract remains represented by the live constraint checks from the catalogue audit.

### Commercial — `EXACTLY_LIVE`

- `202606080002_commercial_listings_foundation.sql`
- `202606110004_commercial_transactions_phase2.sql`
- `202606110005_commercial_crm_foundation_phase3.sql`
- `202606110006_commercial_supply_side_phase4.sql`
- `202606110007_commercial_brokerage_os_phase5.sql`
- Static objects: 74/74 live.
- Contract evidence: commercial MVP tests passed.

## Partial migrations

### `202606090010_created_by_access_remediation.sql` — `PARTIALLY_LIVE`

- 27/30 statically declared objects are live.
- All three declared helper functions are live with the expected signatures.
- These three policies are missing:
  - `private_listings_support_role_select`
  - `private_listings_support_role_update`
  - `private_listings_delete_member_owner`
- Decision: do not replay or repair the historical migration. Phase 4 should create a fresh, forward-only policy reconciliation after reviewing current `private_listings` access rules.

Phase 4 follow-up: later migrations `202607090006` and `202607130005` intentionally replaced these historical policies with the canonical scoped isolation model. No reconciliation policy was required; the historical row was repaired as applied after verifying the successor policies and unchanged schema fingerprints.

### `202607070001_drop_demo_all_rls_grants.sql` — `PARTIALLY_LIVE`

- Legacy `*_demo_all` policies remaining: 0.
- Legacy-table grant findings remaining: 506 across 46 tables.
  - Anonymous table grants: 322.
  - Authenticated write grants: 184.
- Decision: do not apply this migration as part of a ledger batch. It is a standalone security change requiring role-impact analysis, staging access tests, and a rollback grant plan.

## Phase 3 handoff

The following batches may be prepared for ledger-only repair after recoverability is established and their listed smoke evidence is retained:

1. Transaction network: one migration.
2. Lead and communication: five migrations.
3. Workspace platform: four migrations.
4. Commercial: five migrations.
5. Bond: two migrations.

Repair one functional group at a time, rerun `supabase migration list`, and confirm the schema catalogue is unchanged after each batch. Keep both partial migrations excluded.

## Evidence

- `docs/supabase-migration-phase-5-module-drift-report.md`
- `docs/outstanding-migrations-phase-1-evidence.md`
- `sql/outstanding-migrations-phase2-contract-checks.sql`

Local suites passed:

- Partner business distribution
- Lead communication
- Lead suggestions
- Lead recommendations
- Workspace entitlements Phases 4 and 5
- Workspace billing Phases 6 and 7
- Commercial MVP
- Bond bank relationships

## Current gate

**Status: PHASE_2_COMPLETE_RECOVERY_BLOCKED**

The classification matrix is complete. Phase 3 must not repair ledger entries until a verified backup or PITR is available, unless the user explicitly accepts the recovery risk for ledger-only metadata changes.
