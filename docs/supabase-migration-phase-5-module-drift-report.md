# Supabase Migration Phase 5 Module Drift Report

Generated: 2026-07-29T19:35:30.766Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 5 is read-only. It classifies the remaining migration ledger drift by module and performs catalog-only object checks for local-only migrations. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | MODULE_AUDIT_READY |
| Local migration files | 605 |
| Duplicate local timestamps | 0 |
| Remote ledger fetched | yes |
| Matched rows | 555 |
| Split local/remote versions | 17 |
| Reviewed split baseline | 17 |
| Unreviewed split versions | 0 |
| Pure local-only rows | 33 |
| Pure remote-only rows | 0 |
| Application manifest rows | 33 |
| Extracted objects checked | 513 |

## Module Summary

| Module | Pure Local-Only | Split Rows | Unreviewed Split | All Live | Partial Live | None Live | No Static Objects | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bond_finance | 23 | 1 | 0 | 0 | 0 | 22 | 2 | Needs object-level review; do not repair as a batch yet. |
| commercial | 1 | 5 | 0 | 6 | 0 | 0 | 0 | Needs module owner review; static objects were limited or not fetched. |
| lead_capture_crm | 2 | 4 | 0 | 6 | 0 | 0 | 0 | Needs module owner review; static objects were limited or not fetched. |
| workspace_platform | 0 | 4 | 0 | 4 | 0 | 0 | 0 | No local-only work. |
| canonical_documents | 3 | 0 | 0 | 1 | 2 | 0 | 0 | Needs object-level review; do not repair as a batch yet. |
| other | 2 | 1 | 0 | 3 | 0 | 0 | 0 | Needs module owner review; static objects were limited or not fetched. |
| notification_automation | 1 | 1 | 0 | 1 | 0 | 1 | 0 | Candidate for reviewed ledger repair after module smoke evidence. |
| transaction_network | 1 | 1 | 0 | 1 | 0 | 0 | 1 | Candidate for reviewed ledger repair after module smoke evidence. |

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
| 202607260008 | canonical_documents | 202607260008_document_packet_hot_lookup_indexes.sql | 6/6 |
| 202607270013 | commercial | 202607270013_final_mandate_completion_terminal_state.sql | 2/2 |
| 202607270002 | lead_capture_crm | 202607270002_agency_lead_workspace_hot_path_indexes.sql | 4/4 |
| 202607270010 | lead_capture_crm | 202607270010_seller_document_completion_notification.sql | 1/1 |
| 202607270009 | other | 202607270009_client_portal_bootstrap_hot_path_indexes.sql | 7/7 |
| 202607270014 | other | 202607270014_certify_native_structured_legal_pdf.sql | 1/1 |

## Needs Object Review

| Version | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- |
| 202607280003 | bond_finance | 202607280003_guided_bond_application_phase5_submissions.sql | none_live | 0/8 |
| 202607280004 | bond_finance | 202607280004_guided_bond_application_phase6_participants.sql | none_live | 0/33 |
| 202607280005 | bond_finance | 202607280005_guided_bond_application_phase7_sureties_revisions.sql | none_live | 0/21 |
| 202607280006 | bond_finance | 202607280006_guided_bond_application_phase8_external_exports.sql | none_live | 0/20 |
| 202607280007 | bond_finance | 202607280007_guided_bond_application_phase8a_originator_intake.sql | none_live | 0/6 |
| 202607280008 | bond_finance | 202607280008_guided_bond_application_phase8b_originator_document_requests.sql | none_live | 0/10 |
| 202607280009 | bond_finance | 202607280009_guided_bond_application_phase8c_originator_progress_tracking.sql | none_live | 0/7 |
| 202607280010 | bond_finance | 202607280010_guided_bond_application_phase8d_originator_offers_grants.sql | none_live | 0/13 |
| 202607280011 | bond_finance | 202607280011_guided_bond_application_phase8e_buyer_offer_grant_experience.sql | none_live | 0/9 |
| 202607280012 | bond_finance | 202607280012_guided_bond_application_phase8f_agent_progress_view.sql | none_live | 0/1 |
| 202607280013 | bond_finance | 202607280013_guided_bond_application_phase8g_attorney_handoff.sql | none_live | 0/1 |
| 202607280014 | bond_finance | 202607280014_guided_bond_application_phase8h_recipient_specific_formats.sql | none_live | 0/9 |
| 202607280015 | bond_finance | 202607280015_guided_bond_application_phase8i_governance_reporting.sql | none_live | 0/9 |
| 202607280016 | bond_finance | 202607280016_originator_rollout_phase_r1_internal_readiness.sql | none_live | 0/8 |
| 202607280017 | bond_finance | 202607280017_originator_rollout_phase_r2_workspace_mvp.sql | none_live | 0/11 |
| 202607280018 | bond_finance | 202607280018_originator_rollout_phase_r3_document_requests.sql | none_live | 0/8 |
| 202607280019 | bond_finance | 202607280019_originator_rollout_phase_r4_progress_tracking.sql | none_live | 0/7 |
| 202607280020 | bond_finance | 202607280020_originator_rollout_phase_r5_offers_grants_capture.sql | none_live | 0/11 |
| 202607280021 | bond_finance | 202607280021_originator_rollout_phase_r6_one_originator_pilot.sql | none_live | 0/12 |
| 202607280022 | bond_finance | 202607280022_originator_rollout_phase_r7_operational_hardening.sql | none_live | 0/18 |
| 202607280023 | bond_finance | 202607280023_originator_rollout_phase_r8_multi_originator_rollout.sql | none_live | 0/12 |
| 202607280024 | bond_finance | 202607280024_originator_rollout_phase_r9_optional_formal_integrations.sql | none_live | 0/11 |
| 202607270012 | canonical_documents | 202607270012_canonical_matter_lifecycle_stages.sql | partial_live | 3/8 |
| 202607290005 | canonical_documents | 202607290005_corrective_canonical_matter_lifecycle_stages.sql | partial_live | 3/8 |
| 202607280002 | notification_automation | 202607280002_email_notification_branding_readiness.sql | none_live | 0/3 |

## Application Manifest

This is a conservative staging manifest, not authorization to apply SQL. `Depends On` expresses ordering within the inferred deployment stream; every stream still requires a live prerequisite check.

| Action | Count |
| --- | --- |
| apply_original_after_dependency_check | 24 |
| corrective_migration_required | 1 |
| manual_data_review | 2 |
| repair_only_after_smoke | 6 |

| Version | Stream | Depends On | Module | File | Evidence | Action | Required Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 202607270013 | legal_document_runtime | stream preflight | commercial | 202607270013_final_mandate_completion_terminal_state.sql | all_live (2/2) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202607270015 | bond_finance_runtime | stream preflight | bond_finance | 202607270015_bond_finance_document_metadata_cleanup.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 202607280003 | bond_finance_runtime | 202607270015 | bond_finance | 202607280003_guided_bond_application_phase5_submissions.sql | none_live (0/8) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280004 | bond_finance_runtime | 202607280003 | bond_finance | 202607280004_guided_bond_application_phase6_participants.sql | none_live (0/33) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280005 | bond_finance_runtime | 202607280004 | bond_finance | 202607280005_guided_bond_application_phase7_sureties_revisions.sql | none_live (0/21) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280006 | bond_finance_runtime | 202607280005 | bond_finance | 202607280006_guided_bond_application_phase8_external_exports.sql | none_live (0/20) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280007 | bond_finance_runtime | 202607280006 | bond_finance | 202607280007_guided_bond_application_phase8a_originator_intake.sql | none_live (0/6) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280008 | bond_finance_runtime | 202607280007 | bond_finance | 202607280008_guided_bond_application_phase8b_originator_document_requests.sql | none_live (0/10) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280009 | bond_finance_runtime | 202607280008 | bond_finance | 202607280009_guided_bond_application_phase8c_originator_progress_tracking.sql | none_live (0/7) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280010 | bond_finance_runtime | 202607280009 | bond_finance | 202607280010_guided_bond_application_phase8d_originator_offers_grants.sql | none_live (0/13) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280011 | bond_finance_runtime | 202607280010 | bond_finance | 202607280011_guided_bond_application_phase8e_buyer_offer_grant_experience.sql | none_live (0/9) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280012 | bond_finance_runtime | 202607280011 | bond_finance | 202607280012_guided_bond_application_phase8f_agent_progress_view.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280013 | bond_finance_runtime | 202607280012 | bond_finance | 202607280013_guided_bond_application_phase8g_attorney_handoff.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280014 | bond_finance_runtime | 202607280013 | bond_finance | 202607280014_guided_bond_application_phase8h_recipient_specific_formats.sql | none_live (0/9) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280015 | bond_finance_runtime | 202607280014 | bond_finance | 202607280015_guided_bond_application_phase8i_governance_reporting.sql | none_live (0/9) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607260008 | other | stream preflight | canonical_documents | 202607260008_document_packet_hot_lookup_indexes.sql | all_live (6/6) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202607270002 | other | 202607260008 | lead_capture_crm | 202607270002_agency_lead_workspace_hot_path_indexes.sql | all_live (4/4) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202607270009 | other | 202607270002 | other | 202607270009_client_portal_bootstrap_hot_path_indexes.sql | all_live (7/7) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202607270010 | other | 202607270009 | lead_capture_crm | 202607270010_seller_document_completion_notification.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202607270011 | other | 202607270010 | transaction_network | 202607270011_attorney_transaction_key_dates.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 202607270012 | other | 202607270011 | canonical_documents | 202607270012_canonical_matter_lifecycle_stages.sql | partial_live (3/8) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 202607270014 | other | 202607270012 | other | 202607270014_certify_native_structured_legal_pdf.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202607280002 | other | 202607270014 | notification_automation | 202607280002_email_notification_branding_readiness.sql | none_live (0/3) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280016 | other | 202607280002 | bond_finance | 202607280016_originator_rollout_phase_r1_internal_readiness.sql | none_live (0/8) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280017 | other | 202607280016 | bond_finance | 202607280017_originator_rollout_phase_r2_workspace_mvp.sql | none_live (0/11) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280018 | other | 202607280017 | bond_finance | 202607280018_originator_rollout_phase_r3_document_requests.sql | none_live (0/8) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280019 | other | 202607280018 | bond_finance | 202607280019_originator_rollout_phase_r4_progress_tracking.sql | none_live (0/7) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280020 | other | 202607280019 | bond_finance | 202607280020_originator_rollout_phase_r5_offers_grants_capture.sql | none_live (0/11) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280021 | other | 202607280020 | bond_finance | 202607280021_originator_rollout_phase_r6_one_originator_pilot.sql | none_live (0/12) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280022 | other | 202607280021 | bond_finance | 202607280022_originator_rollout_phase_r7_operational_hardening.sql | none_live (0/18) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280023 | other | 202607280022 | bond_finance | 202607280023_originator_rollout_phase_r8_multi_originator_rollout.sql | none_live (0/12) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607280024 | other | 202607280023 | bond_finance | 202607280024_originator_rollout_phase_r9_optional_formal_integrations.sql | none_live (0/11) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607290005 | other | 202607280024 | canonical_documents | 202607290005_corrective_canonical_matter_lifecycle_stages.sql | partial_live (3/8) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |

## Local-Only Drift Detail

| Version | Bucket | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- | --- |
| 202606050001 | split_local_remote | bond_finance | 202606050001_bond_bank_relationship_profiles.sql | no_static_objects | n/a |
| 202607270015 | pure_local_only | bond_finance | 202607270015_bond_finance_document_metadata_cleanup.sql | no_static_objects | n/a |
| 202607280003 | pure_local_only | bond_finance | 202607280003_guided_bond_application_phase5_submissions.sql | none_live | 0/8 |
| 202607280004 | pure_local_only | bond_finance | 202607280004_guided_bond_application_phase6_participants.sql | none_live | 0/33 |
| 202607280005 | pure_local_only | bond_finance | 202607280005_guided_bond_application_phase7_sureties_revisions.sql | none_live | 0/21 |
| 202607280006 | pure_local_only | bond_finance | 202607280006_guided_bond_application_phase8_external_exports.sql | none_live | 0/20 |
| 202607280007 | pure_local_only | bond_finance | 202607280007_guided_bond_application_phase8a_originator_intake.sql | none_live | 0/6 |
| 202607280008 | pure_local_only | bond_finance | 202607280008_guided_bond_application_phase8b_originator_document_requests.sql | none_live | 0/10 |
| 202607280009 | pure_local_only | bond_finance | 202607280009_guided_bond_application_phase8c_originator_progress_tracking.sql | none_live | 0/7 |
| 202607280010 | pure_local_only | bond_finance | 202607280010_guided_bond_application_phase8d_originator_offers_grants.sql | none_live | 0/13 |
| 202607280011 | pure_local_only | bond_finance | 202607280011_guided_bond_application_phase8e_buyer_offer_grant_experience.sql | none_live | 0/9 |
| 202607280012 | pure_local_only | bond_finance | 202607280012_guided_bond_application_phase8f_agent_progress_view.sql | none_live | 0/1 |
| 202607280013 | pure_local_only | bond_finance | 202607280013_guided_bond_application_phase8g_attorney_handoff.sql | none_live | 0/1 |
| 202607280014 | pure_local_only | bond_finance | 202607280014_guided_bond_application_phase8h_recipient_specific_formats.sql | none_live | 0/9 |
| 202607280015 | pure_local_only | bond_finance | 202607280015_guided_bond_application_phase8i_governance_reporting.sql | none_live | 0/9 |
| 202607280016 | pure_local_only | bond_finance | 202607280016_originator_rollout_phase_r1_internal_readiness.sql | none_live | 0/8 |
| 202607280017 | pure_local_only | bond_finance | 202607280017_originator_rollout_phase_r2_workspace_mvp.sql | none_live | 0/11 |
| 202607280018 | pure_local_only | bond_finance | 202607280018_originator_rollout_phase_r3_document_requests.sql | none_live | 0/8 |
| 202607280019 | pure_local_only | bond_finance | 202607280019_originator_rollout_phase_r4_progress_tracking.sql | none_live | 0/7 |
| 202607280020 | pure_local_only | bond_finance | 202607280020_originator_rollout_phase_r5_offers_grants_capture.sql | none_live | 0/11 |
| 202607280021 | pure_local_only | bond_finance | 202607280021_originator_rollout_phase_r6_one_originator_pilot.sql | none_live | 0/12 |
| 202607280022 | pure_local_only | bond_finance | 202607280022_originator_rollout_phase_r7_operational_hardening.sql | none_live | 0/18 |
| 202607280023 | pure_local_only | bond_finance | 202607280023_originator_rollout_phase_r8_multi_originator_rollout.sql | none_live | 0/12 |
| 202607280024 | pure_local_only | bond_finance | 202607280024_originator_rollout_phase_r9_optional_formal_integrations.sql | none_live | 0/11 |
| 202607260008 | pure_local_only | canonical_documents | 202607260008_document_packet_hot_lookup_indexes.sql | all_live | 6/6 |
| 202607270012 | pure_local_only | canonical_documents | 202607270012_canonical_matter_lifecycle_stages.sql | partial_live | 3/8 |
| 202607290005 | pure_local_only | canonical_documents | 202607290005_corrective_canonical_matter_lifecycle_stages.sql | partial_live | 3/8 |
| 202606080002 | split_local_remote | commercial | 202606080002_commercial_listings_foundation.sql | all_live | 12/12 |
| 202606110004 | split_local_remote | commercial | 202606110004_commercial_transactions_phase2.sql | all_live | 18/18 |
| 202606110005 | split_local_remote | commercial | 202606110005_commercial_crm_foundation_phase3.sql | all_live | 32/32 |
| 202606110006 | split_local_remote | commercial | 202606110006_commercial_supply_side_phase4.sql | all_live | 3/3 |
| 202606110007 | split_local_remote | commercial | 202606110007_commercial_brokerage_os_phase5.sql | all_live | 9/9 |
| 202607270013 | pure_local_only | commercial | 202607270013_final_mandate_completion_terminal_state.sql | all_live | 2/2 |
| 202606030007 | split_local_remote | lead_capture_crm | 202606030007_lead_communication_events.sql | all_live | 11/11 |
| 202606030008 | split_local_remote | lead_capture_crm | 202606030008_lead_listing_suggestions.sql | all_live | 11/11 |
| 202606030009 | split_local_remote | lead_capture_crm | 202606030009_lead_recommendations.sql | all_live | 11/11 |
| 202606030010 | split_local_remote | lead_capture_crm | 202606030010_lead_saved_searches.sql | all_live | 11/11 |
| 202607270002 | pure_local_only | lead_capture_crm | 202607270002_agency_lead_workspace_hot_path_indexes.sql | all_live | 4/4 |
| 202607270010 | pure_local_only | lead_capture_crm | 202607270010_seller_document_completion_notification.sql | all_live | 1/1 |
| 202606030011 | split_local_remote | notification_automation | 202606030011_communication_delivery_preferences.sql | all_live | 19/19 |
| 202607280002 | pure_local_only | notification_automation | 202607280002_email_notification_branding_readiness.sql | none_live | 0/3 |
| 202606090010 | split_local_remote | other | 202606090010_created_by_access_remediation.sql | all_live | 30/30 |
| 202607270009 | pure_local_only | other | 202607270009_client_portal_bootstrap_hot_path_indexes.sql | all_live | 7/7 |
| 202607270014 | pure_local_only | other | 202607270014_certify_native_structured_legal_pdf.sql | all_live | 1/1 |
| 202606010001 | split_local_remote | transaction_network | 202606010001_partner_routing_rules_phase1.sql | all_live | 15/15 |
| 202607270011 | pure_local_only | transaction_network | 202607270011_attorney_transaction_key_dates.sql | no_static_objects | n/a |
| 202606040001 | split_local_remote | workspace_platform | 202606040001_onboarding_role_contract_phase2.sql | all_live | 8/8 |
| 202606040002 | split_local_remote | workspace_platform | 202606040002_workspace_entitlements_phase4.sql | all_live | 11/11 |
| 202606040004 | split_local_remote | workspace_platform | 202606040004_workspace_entitlement_enforcement_phase5.sql | all_live | 15/15 |
| 202606040005 | split_local_remote | workspace_platform | 202606040005_workspace_billing_operations_phase6.sql | all_live | 12/12 |

## Object Extraction

| Metric | Value |
| --- | --- |
| Static objects extracted | 513 |
| Catalog rows returned | 513 |
| Object check command | ok |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase5-object-checks-69528.sql --output-format json | ok | Initialising login role... |

## Next Step

Use this module matrix to choose the next small repair batch. Any unreviewed split ledger row must be investigated first; reviewed baseline rows remain excluded from repair batches. Pure local-only rows need module smoke evidence before any `migration repair`.

