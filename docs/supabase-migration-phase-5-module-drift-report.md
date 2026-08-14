# Supabase Migration Phase 5 Module Drift Report

Generated: 2026-08-14T12:34:01.494Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 5 is read-only. It classifies the remaining migration ledger drift by module and performs catalog-only object checks for local-only migrations. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | MODULE_AUDIT_READY |
| Local migration files | 681 |
| Duplicate local timestamps | 0 |
| Remote ledger fetched | yes |
| Matched rows | 653 |
| Split local/remote versions | 17 |
| Reviewed split baseline | 17 |
| Unreviewed split versions | 0 |
| Pure local-only rows | 11 |
| Pure remote-only rows | 0 |
| Application manifest rows | 11 |
| Extracted objects checked | 298 |

## Module Summary

| Module | Pure Local-Only | Split Rows | Unreviewed Split | All Live | Partial Live | None Live | No Static Objects | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| commercial | 0 | 5 | 0 | 5 | 0 | 0 | 0 | No local-only work. |
| other | 4 | 1 | 0 | 3 | 0 | 2 | 0 | Needs object-level review; do not repair as a batch yet. |
| transaction_network | 4 | 1 | 0 | 4 | 1 | 0 | 0 | Candidate for reviewed ledger repair after module smoke evidence. |
| workspace_platform | 1 | 4 | 0 | 5 | 0 | 0 | 0 | Needs module owner review; static objects were limited or not fetched. |
| lead_capture_crm | 0 | 4 | 0 | 4 | 0 | 0 | 0 | No local-only work. |
| notification_automation | 1 | 1 | 0 | 1 | 0 | 0 | 1 | Candidate for reviewed ledger repair after module smoke evidence. |
| bond_finance | 0 | 1 | 0 | 0 | 0 | 0 | 1 | No local-only work. |
| developer_referral | 1 | 0 | 0 | 0 | 1 | 0 | 0 | Needs object-level review; do not repair as a batch yet. |

## Split Ledger Rows

These versions appear as both local-only and remote-only in the Supabase CLI comparison. Treat them as ledger/tooling mismatches, not missing migrations:

- 202606010001
- 202606030007
- 202606030008
- 202606030009
- 202606030010
- 202606030011
- 202606040001
- 202606040002
- 202606040004
- 202606040005
- 202606050001
- 202606080002
- 202606090010
- 202606110004
- 202606110005
- 202606110006
- 202606110007

## Reviewed Repair Candidates

These pure local-only migrations have all statically extracted objects present in the live catalog. They are candidates for later reviewed ledger repair only after module smoke evidence:

| Version | Module | File | Objects Live |
| --- | --- | --- | --- |
| 202608140001 | other | 202608140001_agent_digital_card_intake_links.sql | 2/2 |
| 202608140002 | other | 202608140002_agent_digital_card_events.sql | 7/7 |
| 202608130007 | transaction_network | 202608130007_transaction_subprocess_creation_rls_repair.sql | 4/4 |
| 202608130012 | transaction_network | 202608130012_transaction_link_creation_rls_repair.sql | 4/4 |
| 202608140003 | transaction_network | 202608140003_buyer_onboarding_transaction_bootstrap.sql | 1/1 |
| 202607310008 | workspace_platform | 202607310008_buyer_onboarding_projection_recovery_events.sql | 1/1 |

## Needs Object Review

| Version | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- |
| 202608140007 | developer_referral | 202608140007_development_portal_rls_followup.sql | partial_live | 5/13 |
| 202608140004 | other | 202608140004_backend_drift_compatibility_columns.sql | none_live | 0/12 |
| 202608140005 | other | 202608140005_performance_hardening_hot_path_indexes.sql | none_live | 0/14 |
| 202608140006 | transaction_network | 202608140006_transaction_link_portal_rls_followup.sql | partial_live | 6/12 |

## Application Manifest

This is a conservative staging manifest, not authorization to apply SQL. `Depends On` expresses ordering within the inferred deployment stream; every stream still requires a live prerequisite check.

| Action | Count |
| --- | --- |
| apply_original_after_dependency_check | 2 |
| corrective_migration_required | 2 |
| manual_data_review | 1 |
| repair_only_after_smoke | 6 |

| Version | Stream | Depends On | Module | File | Evidence | Action | Required Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 202607310007 | other | stream preflight | notification_automation | 202607310007_notification_automation_reminder_health_controls.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 202607310008 | other | 202607310007 | workspace_platform | 202607310008_buyer_onboarding_projection_recovery_events.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202608130007 | other | 202607310008 | transaction_network | 202608130007_transaction_subprocess_creation_rls_repair.sql | all_live (4/4) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202608130012 | other | 202608130007 | transaction_network | 202608130012_transaction_link_creation_rls_repair.sql | all_live (4/4) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202608140001 | other | 202608130012 | other | 202608140001_agent_digital_card_intake_links.sql | all_live (2/2) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202608140002 | other | 202608140001 | other | 202608140002_agent_digital_card_events.sql | all_live (7/7) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202608140003 | other | 202608140002 | transaction_network | 202608140003_buyer_onboarding_transaction_bootstrap.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202608140004 | other | 202608140003 | other | 202608140004_backend_drift_compatibility_columns.sql | none_live (0/12) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202608140005 | other | 202608140004 | other | 202608140005_performance_hardening_hot_path_indexes.sql | none_live (0/14) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202608140006 | other | 202608140005 | transaction_network | 202608140006_transaction_link_portal_rls_followup.sql | partial_live (6/12) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 202608140007 | other | 202608140006 | developer_referral | 202608140007_development_portal_rls_followup.sql | partial_live (5/13) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |

## Local-Only Drift Detail

| Version | Bucket | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- | --- |
| 202606050001 | split_local_remote | bond_finance | 202606050001_bond_bank_relationship_profiles.sql | no_static_objects | n/a |
| 202606080002 | split_local_remote | commercial | 202606080002_commercial_listings_foundation.sql | all_live | 12/12 |
| 202606110004 | split_local_remote | commercial | 202606110004_commercial_transactions_phase2.sql | all_live | 18/18 |
| 202606110005 | split_local_remote | commercial | 202606110005_commercial_crm_foundation_phase3.sql | all_live | 32/32 |
| 202606110006 | split_local_remote | commercial | 202606110006_commercial_supply_side_phase4.sql | all_live | 3/3 |
| 202606110007 | split_local_remote | commercial | 202606110007_commercial_brokerage_os_phase5.sql | all_live | 9/9 |
| 202608140007 | pure_local_only | developer_referral | 202608140007_development_portal_rls_followup.sql | partial_live | 5/13 |
| 202606030007 | split_local_remote | lead_capture_crm | 202606030007_lead_communication_events.sql | all_live | 11/11 |
| 202606030008 | split_local_remote | lead_capture_crm | 202606030008_lead_listing_suggestions.sql | all_live | 11/11 |
| 202606030009 | split_local_remote | lead_capture_crm | 202606030009_lead_recommendations.sql | all_live | 11/11 |
| 202606030010 | split_local_remote | lead_capture_crm | 202606030010_lead_saved_searches.sql | all_live | 11/11 |
| 202606030011 | split_local_remote | notification_automation | 202606030011_communication_delivery_preferences.sql | all_live | 19/19 |
| 202607310007 | pure_local_only | notification_automation | 202607310007_notification_automation_reminder_health_controls.sql | no_static_objects | n/a |
| 202606090010 | split_local_remote | other | 202606090010_created_by_access_remediation.sql | all_live | 30/30 |
| 202608140001 | pure_local_only | other | 202608140001_agent_digital_card_intake_links.sql | all_live | 2/2 |
| 202608140002 | pure_local_only | other | 202608140002_agent_digital_card_events.sql | all_live | 7/7 |
| 202608140004 | pure_local_only | other | 202608140004_backend_drift_compatibility_columns.sql | none_live | 0/12 |
| 202608140005 | pure_local_only | other | 202608140005_performance_hardening_hot_path_indexes.sql | none_live | 0/14 |
| 202606010001 | split_local_remote | transaction_network | 202606010001_partner_routing_rules_phase1.sql | all_live | 15/15 |
| 202608130007 | pure_local_only | transaction_network | 202608130007_transaction_subprocess_creation_rls_repair.sql | all_live | 4/4 |
| 202608130012 | pure_local_only | transaction_network | 202608130012_transaction_link_creation_rls_repair.sql | all_live | 4/4 |
| 202608140003 | pure_local_only | transaction_network | 202608140003_buyer_onboarding_transaction_bootstrap.sql | all_live | 1/1 |
| 202608140006 | pure_local_only | transaction_network | 202608140006_transaction_link_portal_rls_followup.sql | partial_live | 6/12 |
| 202606040001 | split_local_remote | workspace_platform | 202606040001_onboarding_role_contract_phase2.sql | all_live | 8/8 |
| 202606040002 | split_local_remote | workspace_platform | 202606040002_workspace_entitlements_phase4.sql | all_live | 11/11 |
| 202606040004 | split_local_remote | workspace_platform | 202606040004_workspace_entitlement_enforcement_phase5.sql | all_live | 15/15 |
| 202606040005 | split_local_remote | workspace_platform | 202606040005_workspace_billing_operations_phase6.sql | all_live | 12/12 |
| 202607310008 | pure_local_only | workspace_platform | 202607310008_buyer_onboarding_projection_recovery_events.sql | all_live | 1/1 |

## Object Extraction

| Metric | Value |
| --- | --- |
| Static objects extracted | 298 |
| Catalog rows returned | 298 |
| Object check command | ok |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase5-object-checks-84788.sql --output-format json | ok | Initialising login role... |

## Next Step

Use this module matrix to choose the next small repair batch. Any unreviewed split ledger row must be investigated first; reviewed baseline rows remain excluded from repair batches. Pure local-only rows need module smoke evidence before any `migration repair`.

