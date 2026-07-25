# Supabase Migration Phase 6 Split Ledger Investigation Report

Generated: 2026-07-25T17:11:40.662Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 6 is read-only. It investigates split local/remote migration versions from Phase 5, checks the live catalog for objects declared by those local migration files, and reads `supabase_migrations.schema_migrations` metadata. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | SPLIT_BASELINE_READY |
| Local migration files | 531 |
| Duplicate local timestamps | 0 |
| Remote ledger fetched | yes |
| Matched rows | 479 |
| Split versions investigated | 27 |
| All static objects live | 24 |
| Partial static objects live | 1 |
| No static objects extracted | 2 |
| Remote migration names matched | 27 |
| Remote migration names unavailable | 0 |
| Reviewed split exceptions | 3 |
| Static objects checked | 299 |

## Module Summary

| Module | Split Rows | All Live | Partial Live | None Live | No Static Objects | Name Matches | Name Unavailable | Reviewed Exceptions | Review Required |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lead_capture_crm | 7 | 6 | 0 | 0 | 1 | 7 | 0 | 1 | 0 |
| workspace_platform | 6 | 6 | 0 | 0 | 0 | 6 | 0 | 0 | 0 |
| commercial | 5 | 5 | 0 | 0 | 0 | 5 | 0 | 0 | 0 |
| bond_finance | 3 | 2 | 0 | 0 | 1 | 3 | 0 | 1 | 0 |
| transaction_network | 3 | 3 | 0 | 0 | 0 | 3 | 0 | 0 | 0 |
| other | 2 | 1 | 1 | 0 | 0 | 2 | 0 | 1 | 0 |
| notification_automation | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |

## Object Review Required

No split rows had partial or missing static object evidence.

## Manual SQL Review

No split rows required manual SQL review because of empty static object extraction.

## Reviewed Split Exceptions

| Version | Module | Decision | Evidence |
| --- | --- | --- | --- |
| 202606050001 | bond_finance | confirmed_live_manual_sql | All five bond_banks relationship columns added by the single ALTER TABLE statement are live. |
| 202606090010 | other | confirmed_superseded_split | The three absent private_listings policies were superseded by the applied scoped policies in 202607090006 and 202607130005. |
| 202607230009 | lead_capture_crm | confirmed_live_manual_sql | Live function definition for bridge_convert_attorney_lead_to_matter contains the cancellation_attorney role gate, bridge_attorney_member_assignment_eligible check, and cancellation-matters function comment. |

## Metadata Name Drift

No split row exposed a remote migration name that differed from the local file name.

## Split Row Detail

| Version | Module | Local File | Remote Name | Name Status | Object Status | Objects Live | Statements | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 202606010001 | transaction_network | 202606010001_partner_routing_rules_phase1.sql | partner_routing_rules_phase1 | remote_name_matches | all_live | 15/15 | 28 | confirmed_live_split |
| 202606030007 | lead_capture_crm | 202606030007_lead_communication_events.sql | lead_communication_events | remote_name_matches | all_live | 11/11 | 15 | confirmed_live_split |
| 202606030008 | lead_capture_crm | 202606030008_lead_listing_suggestions.sql | lead_listing_suggestions | remote_name_matches | all_live | 11/11 | 15 | confirmed_live_split |
| 202606030009 | lead_capture_crm | 202606030009_lead_recommendations.sql | lead_recommendations | remote_name_matches | all_live | 11/11 | 15 | confirmed_live_split |
| 202606030010 | lead_capture_crm | 202606030010_lead_saved_searches.sql | lead_saved_searches | remote_name_matches | all_live | 11/11 | 15 | confirmed_live_split |
| 202606030011 | notification_automation | 202606030011_communication_delivery_preferences.sql | communication_delivery_preferences | remote_name_matches | all_live | 19/19 | 29 | confirmed_live_split |
| 202606040001 | workspace_platform | 202606040001_onboarding_role_contract_phase2.sql | onboarding_role_contract_phase2 | remote_name_matches | all_live | 8/8 | 24 | confirmed_live_split |
| 202606040002 | workspace_platform | 202606040002_workspace_entitlements_phase4.sql | workspace_entitlements_phase4 | remote_name_matches | all_live | 11/11 | 26 | confirmed_live_split |
| 202606040004 | workspace_platform | 202606040004_workspace_entitlement_enforcement_phase5.sql | workspace_entitlement_enforcement_phase5 | remote_name_matches | all_live | 15/15 | 21 | confirmed_live_split |
| 202606040005 | workspace_platform | 202606040005_workspace_billing_operations_phase6.sql | workspace_billing_operations_phase6 | remote_name_matches | all_live | 12/12 | 22 | confirmed_live_split |
| 202606050001 | bond_finance | 202606050001_bond_bank_relationship_profiles.sql | bond_bank_relationship_profiles | remote_name_matches | no_static_objects | n/a | 1 | confirmed_live_manual_sql |
| 202606080002 | commercial | 202606080002_commercial_listings_foundation.sql | commercial_listings_foundation | remote_name_matches | all_live | 12/12 | 21 | confirmed_live_split |
| 202606090010 | other | 202606090010_created_by_access_remediation.sql | created_by_access_remediation | remote_name_matches | partial_live | 27/30 | 63 | confirmed_superseded_split |
| 202606110004 | commercial | 202606110004_commercial_transactions_phase2.sql | commercial_transactions_phase2 | remote_name_matches | all_live | 18/18 | 28 | confirmed_live_split |
| 202606110005 | commercial | 202606110005_commercial_crm_foundation_phase3.sql | commercial_crm_foundation_phase3 | remote_name_matches | all_live | 32/32 | 53 | confirmed_live_split |
| 202606110006 | commercial | 202606110006_commercial_supply_side_phase4.sql | commercial_supply_side_phase4 | remote_name_matches | all_live | 3/3 | 12 | confirmed_live_split |
| 202606110007 | commercial | 202606110007_commercial_brokerage_os_phase5.sql | commercial_brokerage_os_phase5 | remote_name_matches | all_live | 9/9 | 17 | confirmed_live_split |
| 202607220015 | bond_finance | 202607220015_bond_bank_outcomes_and_registration_handoff.sql | bond_bank_outcomes_and_registration_handoff | remote_name_matches | all_live | 5/5 | 13 | confirmed_live_split |
| 202607230002 | lead_capture_crm | 202607230002_seller_transaction_tracking_continuity.sql | seller_transaction_tracking_continuity | remote_name_matches | all_live | 6/6 | 17 | confirmed_live_split |
| 202607230003 | lead_capture_crm | 202607230003_seller_transaction_tracking_phase4_compatibility.sql | seller_transaction_tracking_phase4_compatibility | remote_name_matches | all_live | 5/5 | 10 | confirmed_live_split |
| 202607230006 | workspace_platform | 202607230006_buyer_onboarding_portal_token_handoff.sql | buyer_onboarding_portal_token_handoff | remote_name_matches | all_live | 4/4 | 14 | confirmed_live_split |
| 202607230007 | workspace_platform | 202607230007_buyer_onboarding_snapshot_token_fence.sql | buyer_onboarding_snapshot_token_fence | remote_name_matches | all_live | 1/1 | 8 | confirmed_live_split |
| 202607230008 | transaction_network | 202607230008_attorney_three_lane_transaction_spine.sql | attorney_three_lane_transaction_spine | remote_name_matches | all_live | 15/15 | 39 | confirmed_live_split |
| 202607230009 | lead_capture_crm | 202607230009_attorney_lead_cancellation_qualification.sql | attorney_lead_cancellation_qualification | remote_name_matches | no_static_objects | n/a | 5 | confirmed_live_manual_sql |
| 202607230010 | transaction_network | 202607230010_transaction_progress_scheduler_proof_phase8.sql | transaction_progress_scheduler_proof_phase8 | remote_name_matches | all_live | 6/6 | 20 | confirmed_live_split |
| 202607230011 | bond_finance | 202607230011_bond_bank_outcome_originator_rls_repair.sql | bond_bank_outcome_originator_rls_repair | remote_name_matches | all_live | 3/3 | 11 | confirmed_live_split |
| 202607230012 | other | 202607230012_portal_storage_policy_spine.sql | portal_storage_policy_spine | remote_name_matches | all_live | 26/26 | 76 | confirmed_live_split |

## Object Extraction

| Metric | Value |
| --- | --- |
| Static objects extracted | 299 |
| Catalog rows returned | 299 |
| Object check command | ok |
| History metadata command | ok |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase6-history-73820.sql --output-format json | ok | Initialising login role... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase6-object-checks-73820.sql --output-format json | ok | Initialising login role... |

## Next Step

Treat split rows as already remote-recorded and leave them out of repair batches. Continue with the smallest pure-local-only module batch that has live-object and smoke-test evidence.

