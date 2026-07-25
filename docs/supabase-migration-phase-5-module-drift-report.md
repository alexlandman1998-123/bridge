# Supabase Migration Phase 5 Module Drift Report

Generated: 2026-07-25T17:17:08.767Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 5 is read-only. It classifies the remaining migration ledger drift by module and performs catalog-only object checks for local-only migrations. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | MODULE_AUDIT_READY |
| Local migration files | 547 |
| Duplicate local timestamps | 0 |
| Remote ledger fetched | yes |
| Matched rows | 505 |
| Split local/remote versions | 17 |
| Reviewed split baseline | 17 |
| Unreviewed split versions | 0 |
| Pure local-only rows | 25 |
| Pure remote-only rows | 0 |
| Application manifest rows | 25 |
| Extracted objects checked | 400 |

## Module Summary

| Module | Pure Local-Only | Split Rows | Unreviewed Split | All Live | Partial Live | None Live | No Static Objects | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| other | 8 | 1 | 0 | 0 | 5 | 4 | 0 | Needs object-level review; do not repair as a batch yet. |
| lead_capture_crm | 4 | 4 | 0 | 6 | 2 | 0 | 0 | Needs object-level review; do not repair as a batch yet. |
| canonical_documents | 7 | 0 | 0 | 1 | 2 | 4 | 0 | Needs object-level review; do not repair as a batch yet. |
| commercial | 2 | 5 | 0 | 5 | 0 | 1 | 1 | Needs object-level review; do not repair as a batch yet. |
| workspace_platform | 1 | 4 | 0 | 4 | 0 | 1 | 0 | Needs object-level review; do not repair as a batch yet. |
| bond_finance | 2 | 1 | 0 | 0 | 0 | 2 | 1 | Needs object-level review; do not repair as a batch yet. |
| attorney | 1 | 0 | 0 | 1 | 0 | 0 | 0 | Candidate for reviewed ledger repair after module smoke evidence. |
| notification_automation | 0 | 1 | 0 | 1 | 0 | 0 | 0 | No local-only work. |
| transaction_network | 0 | 1 | 0 | 1 | 0 | 0 | 0 | No local-only work. |

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
| 202607230013 | attorney | 202607230013_attorney_workflow_step_completion_advance.sql | 2/2 |
| 202607220001 | canonical_documents | 202607220001_document_workspace_status_phase2.sql | 1/1 |
| 202607220010 | lead_capture_crm | 202607220010_phase4_seller_portal_final_artifact_fence.sql | 5/5 |
| 202607250001 | lead_capture_crm | 202607250001_seller_portal_payload_optional_enrichment_guard.sql | 1/1 |

## Needs Object Review

| Version | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- |
| 202607220013 | bond_finance | 202607220013_bond_application_consent_and_finance_document_audit.sql | none_live | 0/4 |
| 202607220014 | bond_finance | 202607220014_bond_partner_referral_terms_and_ledger.sql | none_live | 0/8 |
| 202607220003 | canonical_documents | 202607220003_signable_packet_sent_phase1.sql | none_live | 0/2 |
| 202607220004 | canonical_documents | 202607220004_canonical_otp_signing_phase2.sql | partial_live | 3/11 |
| 202607220005 | canonical_documents | 202607220005_canonical_otp_seal_atomic_recovery.sql | none_live | 0/1 |
| 202607220008 | canonical_documents | 202607220008_phase4_legal_template_release_integrity.sql | none_live | 0/6 |
| 202607220012 | canonical_documents | 202607220012_phase5_legal_document_health_incident_integrity.sql | none_live | 0/7 |
| 202607250002 | canonical_documents | 202607250002_corrective_canonical_otp_signing_phase2.sql | partial_live | 3/11 |
| 202607220002 | commercial | 202607220002_authoritative_mandate_signing_delivery_phase0.sql | none_live | 0/15 |
| 202607230001 | lead_capture_crm | 202607230001_reconcile_seller_document_transaction_continuity.sql | partial_live | 3/17 |
| 202607250005 | lead_capture_crm | 202607250005_corrective_seller_document_transaction_continuity.sql | partial_live | 3/17 |
| 202607220006 | other | 202607220006_phase3_visual_signature_evidence.sql | partial_live | 2/5 |
| 202607220007 | other | 202607220007_phase4_legal_runtime_metadata_immutability.sql | partial_live | 3/4 |
| 202607220009 | other | 202607220009_phase4_legal_release_provenance.sql | none_live | 0/4 |
| 202607220011 | other | 202607220011_phase4_legal_release_persistence_fence.sql | none_live | 0/5 |
| 202607230004 | other | 202607230004_phase5_pilot_release_trace_integrity.sql | none_live | 0/10 |
| 202607230005 | other | 202607230005_phase6_successor_release_epoch_integrity.sql | none_live | 0/26 |
| 202607250003 | other | 202607250003_corrective_visual_signature_evidence.sql | partial_live | 2/5 |
| 202607250004 | other | 202607250004_corrective_legal_runtime_metadata_immutability.sql | partial_live | 3/4 |
| 202607240001 | workspace_platform | 202607240001_agent_profile_management_rpc.sql | none_live | 0/1 |

## Application Manifest

This is a conservative staging manifest, not authorization to apply SQL. `Depends On` expresses ordering within the inferred deployment stream; every stream still requires a live prerequisite check.

| Action | Count |
| --- | --- |
| apply_original_after_dependency_check | 16 |
| corrective_migration_required | 4 |
| manual_data_review | 1 |
| repair_only_after_smoke | 4 |

| Version | Stream | Depends On | Module | File | Evidence | Action | Required Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 202607220001 | legal_document_runtime | stream preflight | canonical_documents | 202607220001_document_workspace_status_phase2.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202607220002 | legal_document_runtime | 202607220001 | commercial | 202607220002_authoritative_mandate_signing_delivery_phase0.sql | none_live (0/15) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607220003 | legal_document_runtime | 202607220002 | canonical_documents | 202607220003_signable_packet_sent_phase1.sql | none_live (0/2) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607220004 | legal_document_runtime | 202607220003 | canonical_documents | 202607220004_canonical_otp_signing_phase2.sql | partial_live (3/11) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 202607220005 | legal_document_runtime | 202607220004 | canonical_documents | 202607220005_canonical_otp_seal_atomic_recovery.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607220006 | legal_document_runtime | 202607220005 | other | 202607220006_phase3_visual_signature_evidence.sql | partial_live (2/5) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 202607220007 | legal_document_runtime | 202607220006 | other | 202607220007_phase4_legal_runtime_metadata_immutability.sql | partial_live (3/4) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 202607220008 | legal_document_runtime | 202607220007 | canonical_documents | 202607220008_phase4_legal_template_release_integrity.sql | none_live (0/6) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607220009 | legal_document_runtime | 202607220008 | other | 202607220009_phase4_legal_release_provenance.sql | none_live (0/4) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607220010 | legal_document_runtime | 202607220009 | lead_capture_crm | 202607220010_phase4_seller_portal_final_artifact_fence.sql | all_live (5/5) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202607220011 | legal_document_runtime | 202607220010 | other | 202607220011_phase4_legal_release_persistence_fence.sql | none_live (0/5) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607220012 | legal_document_runtime | 202607220011 | canonical_documents | 202607220012_phase5_legal_document_health_incident_integrity.sql | none_live (0/7) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607230004 | legal_document_runtime | 202607220012 | other | 202607230004_phase5_pilot_release_trace_integrity.sql | none_live (0/10) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607230005 | legal_document_runtime | 202607230004 | other | 202607230005_phase6_successor_release_epoch_integrity.sql | none_live (0/26) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607240002 | legal_document_runtime | 202607230005 | commercial | 202607240002_global_mandate_platform_default_phase2.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 202607250002 | legal_document_runtime | 202607240002 | canonical_documents | 202607250002_corrective_canonical_otp_signing_phase2.sql | partial_live (3/11) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607250003 | legal_document_runtime | 202607250002 | other | 202607250003_corrective_visual_signature_evidence.sql | partial_live (2/5) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607250004 | legal_document_runtime | 202607250003 | other | 202607250004_corrective_legal_runtime_metadata_immutability.sql | partial_live (3/4) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607230001 | seller_transaction_continuity | stream preflight | lead_capture_crm | 202607230001_reconcile_seller_document_transaction_continuity.sql | partial_live (3/17) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 202607220013 | bond_finance_runtime | stream preflight | bond_finance | 202607220013_bond_application_consent_and_finance_document_audit.sql | none_live (0/4) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607220014 | bond_finance_runtime | 202607220013 | bond_finance | 202607220014_bond_partner_referral_terms_and_ledger.sql | none_live (0/8) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607230013 | attorney_workflow_runtime | stream preflight | attorney | 202607230013_attorney_workflow_step_completion_advance.sql | all_live (2/2) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202607240001 | workspace_profile_management | stream preflight | workspace_platform | 202607240001_agent_profile_management_rpc.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607250001 | other | stream preflight | lead_capture_crm | 202607250001_seller_portal_payload_optional_enrichment_guard.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202607250005 | other | 202607250001 | lead_capture_crm | 202607250005_corrective_seller_document_transaction_continuity.sql | partial_live (3/17) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |

## Local-Only Drift Detail

| Version | Bucket | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- | --- |
| 202607230013 | pure_local_only | attorney | 202607230013_attorney_workflow_step_completion_advance.sql | all_live | 2/2 |
| 202606050001 | split_local_remote | bond_finance | 202606050001_bond_bank_relationship_profiles.sql | no_static_objects | n/a |
| 202607220013 | pure_local_only | bond_finance | 202607220013_bond_application_consent_and_finance_document_audit.sql | none_live | 0/4 |
| 202607220014 | pure_local_only | bond_finance | 202607220014_bond_partner_referral_terms_and_ledger.sql | none_live | 0/8 |
| 202607220001 | pure_local_only | canonical_documents | 202607220001_document_workspace_status_phase2.sql | all_live | 1/1 |
| 202607220003 | pure_local_only | canonical_documents | 202607220003_signable_packet_sent_phase1.sql | none_live | 0/2 |
| 202607220004 | pure_local_only | canonical_documents | 202607220004_canonical_otp_signing_phase2.sql | partial_live | 3/11 |
| 202607220005 | pure_local_only | canonical_documents | 202607220005_canonical_otp_seal_atomic_recovery.sql | none_live | 0/1 |
| 202607220008 | pure_local_only | canonical_documents | 202607220008_phase4_legal_template_release_integrity.sql | none_live | 0/6 |
| 202607220012 | pure_local_only | canonical_documents | 202607220012_phase5_legal_document_health_incident_integrity.sql | none_live | 0/7 |
| 202607250002 | pure_local_only | canonical_documents | 202607250002_corrective_canonical_otp_signing_phase2.sql | partial_live | 3/11 |
| 202606080002 | split_local_remote | commercial | 202606080002_commercial_listings_foundation.sql | all_live | 12/12 |
| 202606110004 | split_local_remote | commercial | 202606110004_commercial_transactions_phase2.sql | all_live | 18/18 |
| 202606110005 | split_local_remote | commercial | 202606110005_commercial_crm_foundation_phase3.sql | all_live | 32/32 |
| 202606110006 | split_local_remote | commercial | 202606110006_commercial_supply_side_phase4.sql | all_live | 3/3 |
| 202606110007 | split_local_remote | commercial | 202606110007_commercial_brokerage_os_phase5.sql | all_live | 9/9 |
| 202607220002 | pure_local_only | commercial | 202607220002_authoritative_mandate_signing_delivery_phase0.sql | none_live | 0/15 |
| 202607240002 | pure_local_only | commercial | 202607240002_global_mandate_platform_default_phase2.sql | no_static_objects | n/a |
| 202606030007 | split_local_remote | lead_capture_crm | 202606030007_lead_communication_events.sql | all_live | 11/11 |
| 202606030008 | split_local_remote | lead_capture_crm | 202606030008_lead_listing_suggestions.sql | all_live | 11/11 |
| 202606030009 | split_local_remote | lead_capture_crm | 202606030009_lead_recommendations.sql | all_live | 11/11 |
| 202606030010 | split_local_remote | lead_capture_crm | 202606030010_lead_saved_searches.sql | all_live | 11/11 |
| 202607220010 | pure_local_only | lead_capture_crm | 202607220010_phase4_seller_portal_final_artifact_fence.sql | all_live | 5/5 |
| 202607230001 | pure_local_only | lead_capture_crm | 202607230001_reconcile_seller_document_transaction_continuity.sql | partial_live | 3/17 |
| 202607250001 | pure_local_only | lead_capture_crm | 202607250001_seller_portal_payload_optional_enrichment_guard.sql | all_live | 1/1 |
| 202607250005 | pure_local_only | lead_capture_crm | 202607250005_corrective_seller_document_transaction_continuity.sql | partial_live | 3/17 |
| 202606030011 | split_local_remote | notification_automation | 202606030011_communication_delivery_preferences.sql | all_live | 19/19 |
| 202606090010 | split_local_remote | other | 202606090010_created_by_access_remediation.sql | partial_live | 27/30 |
| 202607220006 | pure_local_only | other | 202607220006_phase3_visual_signature_evidence.sql | partial_live | 2/5 |
| 202607220007 | pure_local_only | other | 202607220007_phase4_legal_runtime_metadata_immutability.sql | partial_live | 3/4 |
| 202607220009 | pure_local_only | other | 202607220009_phase4_legal_release_provenance.sql | none_live | 0/4 |
| 202607220011 | pure_local_only | other | 202607220011_phase4_legal_release_persistence_fence.sql | none_live | 0/5 |
| 202607230004 | pure_local_only | other | 202607230004_phase5_pilot_release_trace_integrity.sql | none_live | 0/10 |
| 202607230005 | pure_local_only | other | 202607230005_phase6_successor_release_epoch_integrity.sql | none_live | 0/26 |
| 202607250003 | pure_local_only | other | 202607250003_corrective_visual_signature_evidence.sql | partial_live | 2/5 |
| 202607250004 | pure_local_only | other | 202607250004_corrective_legal_runtime_metadata_immutability.sql | partial_live | 3/4 |
| 202606010001 | split_local_remote | transaction_network | 202606010001_partner_routing_rules_phase1.sql | all_live | 15/15 |
| 202606040001 | split_local_remote | workspace_platform | 202606040001_onboarding_role_contract_phase2.sql | all_live | 8/8 |
| 202606040002 | split_local_remote | workspace_platform | 202606040002_workspace_entitlements_phase4.sql | all_live | 11/11 |
| 202606040004 | split_local_remote | workspace_platform | 202606040004_workspace_entitlement_enforcement_phase5.sql | all_live | 15/15 |
| 202606040005 | split_local_remote | workspace_platform | 202606040005_workspace_billing_operations_phase6.sql | all_live | 12/12 |
| 202607240001 | pure_local_only | workspace_platform | 202607240001_agent_profile_management_rpc.sql | none_live | 0/1 |

## Object Extraction

| Metric | Value |
| --- | --- |
| Static objects extracted | 400 |
| Catalog rows returned | 400 |
| Object check command | ok |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase5-object-checks-75432.sql --output-format json | ok | Initialising login role... |

## Next Step

Use this module matrix to choose the next small repair batch. Any unreviewed split ledger row must be investigated first; reviewed baseline rows remain excluded from repair batches. Pure local-only rows need module smoke evidence before any `migration repair`.

