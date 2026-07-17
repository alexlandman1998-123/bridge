# Supabase Migration Phase 5 Module Drift Report

Generated: 2026-07-17T11:41:39.741Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 5 is read-only. It classifies the remaining migration ledger drift by module and performs catalog-only object checks for local-only migrations. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | MODULE_AUDIT_READY |
| Local migration files | 419 |
| Duplicate local timestamps | 0 |
| Remote ledger fetched | yes |
| Matched rows | 402 |
| Split local/remote versions | 17 |
| Pure local-only rows | 0 |
| Pure remote-only rows | 0 |
| Extracted objects checked | 228 |

## Module Summary

| Module | Pure Local-Only | Split Rows | All Live | Partial Live | None Live | No Static Objects | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| commercial | 0 | 5 | 5 | 0 | 0 | 0 | Resolve split ledger rows before any module repair batch. |
| lead_capture_crm | 0 | 4 | 4 | 0 | 0 | 0 | Resolve split ledger rows before any module repair batch. |
| workspace_platform | 0 | 4 | 4 | 0 | 0 | 0 | Resolve split ledger rows before any module repair batch. |
| bond_finance | 0 | 1 | 0 | 0 | 0 | 1 | Resolve split ledger rows before any module repair batch. |
| notification_automation | 0 | 1 | 1 | 0 | 0 | 0 | Resolve split ledger rows before any module repair batch. |
| other | 0 | 1 | 0 | 1 | 0 | 0 | Resolve split ledger rows before any module repair batch. |
| transaction_network | 0 | 1 | 1 | 0 | 0 | 0 | Resolve split ledger rows before any module repair batch. |

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

No pure local-only migration is ready for repair from static object evidence alone.

## Needs Object Review

No pure local-only migrations had partial or missing static object evidence.

## Local-Only Drift Detail

| Version | Bucket | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- | --- |
| 202606050001 | split_local_remote | bond_finance | 202606050001_bond_bank_relationship_profiles.sql | no_static_objects | n/a |
| 202606080002 | split_local_remote | commercial | 202606080002_commercial_listings_foundation.sql | all_live | 12/12 |
| 202606110004 | split_local_remote | commercial | 202606110004_commercial_transactions_phase2.sql | all_live | 18/18 |
| 202606110005 | split_local_remote | commercial | 202606110005_commercial_crm_foundation_phase3.sql | all_live | 32/32 |
| 202606110006 | split_local_remote | commercial | 202606110006_commercial_supply_side_phase4.sql | all_live | 3/3 |
| 202606110007 | split_local_remote | commercial | 202606110007_commercial_brokerage_os_phase5.sql | all_live | 9/9 |
| 202606030007 | split_local_remote | lead_capture_crm | 202606030007_lead_communication_events.sql | all_live | 11/11 |
| 202606030008 | split_local_remote | lead_capture_crm | 202606030008_lead_listing_suggestions.sql | all_live | 11/11 |
| 202606030009 | split_local_remote | lead_capture_crm | 202606030009_lead_recommendations.sql | all_live | 11/11 |
| 202606030010 | split_local_remote | lead_capture_crm | 202606030010_lead_saved_searches.sql | all_live | 11/11 |
| 202606030011 | split_local_remote | notification_automation | 202606030011_communication_delivery_preferences.sql | all_live | 19/19 |
| 202606090010 | split_local_remote | other | 202606090010_created_by_access_remediation.sql | partial_live | 27/30 |
| 202606010001 | split_local_remote | transaction_network | 202606010001_partner_routing_rules_phase1.sql | all_live | 15/15 |
| 202606040001 | split_local_remote | workspace_platform | 202606040001_onboarding_role_contract_phase2.sql | all_live | 8/8 |
| 202606040002 | split_local_remote | workspace_platform | 202606040002_workspace_entitlements_phase4.sql | all_live | 11/11 |
| 202606040004 | split_local_remote | workspace_platform | 202606040004_workspace_entitlement_enforcement_phase5.sql | all_live | 15/15 |
| 202606040005 | split_local_remote | workspace_platform | 202606040005_workspace_billing_operations_phase6.sql | all_live | 12/12 |

## Object Extraction

| Metric | Value |
| --- | --- |
| Static objects extracted | 228 |
| Catalog rows returned | 228 |
| Object check command | ok |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase5-object-checks-5018.sql --output-format json | ok | Initialising login role... |

## Next Step

Use this module matrix to choose the next small repair batch. Split ledger rows should be investigated before broad migration operations; pure local-only rows need module smoke evidence before any further `migration repair`.

