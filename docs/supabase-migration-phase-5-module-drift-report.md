# Supabase Migration Phase 5 Module Drift Report

Generated: 2026-09-08T09:30:19.882Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 5 is read-only. It classifies the remaining migration ledger drift by module and performs catalog-only object checks for local-only migrations. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | MODULE_AUDIT_READY |
| Local migration files | 1037 |
| Duplicate local timestamps | 0 |
| Remote ledger fetched | yes |
| Matched rows | 913 |
| Split local/remote versions | 1 |
| Reviewed split baseline | 0 |
| Unreviewed split versions | 1 |
| Pure local-only rows | 123 |
| Pure remote-only rows | 0 |
| Application manifest rows | 123 |
| Extracted objects checked | 756 |

## Module Summary

| Module | Pure Local-Only | Split Rows | Unreviewed Split | All Live | Partial Live | None Live | No Static Objects | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| other | 32 | 0 | 0 | 17 | 4 | 9 | 2 | Needs object-level review; do not repair as a batch yet. |
| workspace_platform | 20 | 0 | 0 | 5 | 3 | 6 | 6 | Needs object-level review; do not repair as a batch yet. |
| transaction_network | 16 | 0 | 0 | 6 | 2 | 5 | 3 | Needs object-level review; do not repair as a batch yet. |
| lead_capture_crm | 14 | 1 | 1 | 7 | 4 | 2 | 2 | Resolve split ledger rows before any module repair batch. |
| attorney | 14 | 0 | 0 | 4 | 2 | 4 | 4 | Needs object-level review; do not repair as a batch yet. |
| developer_referral | 13 | 0 | 0 | 4 | 6 | 3 | 0 | Needs object-level review; do not repair as a batch yet. |
| bond_finance | 5 | 0 | 0 | 0 | 2 | 3 | 0 | Needs object-level review; do not repair as a batch yet. |
| commercial | 5 | 0 | 0 | 3 | 0 | 0 | 2 | Needs module owner review; static objects were limited or not fetched. |
| canonical_documents | 4 | 0 | 0 | 1 | 0 | 2 | 1 | Needs object-level review; do not repair as a batch yet. |

## Split Ledger Rows

These versions appear as both local-only and remote-only in the Supabase CLI comparison. Treat them as ledger/tooling mismatches, not missing migrations:

- 202609030001

## Reviewed Repair Candidates

These pure local-only migrations have all statically extracted objects present in the live catalog. They are candidates for later reviewed ledger repair only after module smoke evidence:

| Version | Module | File | Objects Live |
| --- | --- | --- | --- |
| 20260830125035 | attorney | 20260830125035_attorney_dashboard_rpc_hot_path.sql | 2/2 |
| 20260831090414 | attorney | 20260831090414_attorney_matter_list_read_model_phase3_staging_catchup.sql | 1/1 |
| 20260903094957 | attorney | 20260903094957_retire_inactive_attorney_assignments.sql | 2/2 |
| 20260908064347 | attorney | 20260908064347_align_attorney_lane_progress_with_matter_plan.sql | 1/1 |
| 20260906190137 | canonical_documents | 20260906190137_public_websites_home_seekers_template.sql | 2/2 |
| 20260905141009 | commercial | 20260905141009_rental_landlord_mandate_foundation.sql | 19/19 |
| 20260905141010 | commercial | 20260905141010_rental_vacancy_foundation.sql | 15/15 |
| 20260905141012 | commercial | 20260905141012_rental_vacancy_marketing_foundation.sql | 9/9 |
| 20260831074347 | developer_referral | 20260831074347_developer_document_portal_deny_direct_access.sql | 1/1 |
| 20260902095249 | developer_referral | 20260902095249_public_development_organisation_branding.sql | 1/1 |
| 20260902105303 | developer_referral | 20260902105303_public_development_high_contrast_branding.sql | 1/1 |
| 20260905150420 | developer_referral | 20260905150420_development_visual_analytics_phase14.sql | 8/8 |
| 20260829195657 | lead_capture_crm | 20260829195657_seller_onboarding_link_fast_prepare.sql | 1/1 |
| 20260831120000 | lead_capture_crm | 20260831120000_property24_migration_listing_media_storage.sql | 4/4 |
| 20260905090353 | lead_capture_crm | 20260905090353_document_trust_phase1_seller_atomic_link.sql | 1/1 |
| 20260906130000 | lead_capture_crm | 20260906130000_meta_lead_ads_integration.sql | 11/11 |
| 20260906173716 | lead_capture_crm | 20260906173716_add_meta_lead_form_type.sql | 2/2 |
| 20260906175502 | lead_capture_crm | 20260906175502_meta_lead_ads_backfill_foundation.sql | 11/11 |
| 20260831140736 | other | 20260831140736_property24_agent_catalog_mappings.sql | 12/12 |
| 20260901165511 | other | 20260901165511_website_publication_workflow_phase6.sql | 3/3 |
| 20260905141005 | other | 20260905141005_rental_property_foundation.sql | 20/20 |
| 20260905141007 | other | 20260905141007_rental_unit_foundation.sql | 16/16 |
| 20260905141013 | other | 20260905141013_rental_internal_marketing_operations.sql | 14/14 |
| 20260905141014 | other | 20260905141014_rental_applications_and_applicant_access.sql | 9/9 |
| 20260905141015 | other | 20260905141015_rental_application_submission.sql | 2/2 |
| 20260905141016 | other | 20260905141016_rental_application_documents.sql | 3/3 |
| 20260905141018 | other | 20260905141018_rental_application_screening.sql | 11/11 |
| 20260905141019 | other | 20260905141019_rental_application_screening_reviewer_actor.sql | 1/1 |
| 20260905141020 | other | 20260905141020_rental_application_decisions.sql | 13/13 |
| 20260905141021 | other | 20260905141021_rental_application_tenancy_conversion.sql | 13/13 |
| 20260906123000 | other | 20260906123000_public_websites_pilot_closeout_phase5_go_live.sql | 6/6 |
| 20260906133000 | other | 20260906133000_public_websites_pilot_closeout_phase6_hypercare.sql | 27/27 |
| 20260906134500 | other | 20260906134500_public_websites_pilot_closeout_phase6_hypercare_indexes.sql | 5/5 |
| 20260906140000 | other | 20260906140000_public_websites_pilot_closeout_phase6_approval_gate.sql | 1/1 |
| 20260907194623 | other | 20260907194623_repair_deal_setup_schema_compatibility.sql | 1/1 |
| 202608230002 | transaction_network | 202608230002_transaction_sale_profile_phase1.sql | 4/4 |
| 20260827081713 | transaction_network | 20260827081713_normalize_transaction_participant_assignment_sources.sql | 3/3 |
| 20260827091439 | transaction_network | 20260827091439_transaction_setup_owner_rls_access.sql | 2/2 |
| 20260831071807 | transaction_network | 20260831071807_canonical_transaction_requirements_on_creation.sql | 2/2 |
| 20260831072652 | transaction_network | 20260831072652_canonical_transaction_requirements_on_creation.sql | 2/2 |
| 20260907193000 | transaction_network | 20260907193000_transaction_buyer_parties_phase3.sql | 1/1 |
| 202608240001 | workspace_platform | 202608240001_prospect_demo_configs.sql | 7/7 |
| 20260824091732 | workspace_platform | 20260824091732_align_prospect_demo_admin_rls.sql | 1/1 |
| 20260901140943 | workspace_platform | 20260901140943_harden_admin_portal_authorization.sql | 3/3 |
| 20260903094624 | workspace_platform | 20260903094624_organisation_workspace_lock.sql | 1/1 |
| 20260905141017 | workspace_platform | 20260905141017_rental_application_review_workspace.sql | 1/1 |

## Needs Object Review

| Version | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- |
| 20260906070515 | attorney | 20260906070515_attorney_coordination_nomination_phase2.sql | none_live | 0/1 |
| 20260906070938 | attorney | 20260906070938_attorney_lane_delegation_phase3.sql | partial_live | 1/7 |
| 20260906071644 | attorney | 20260906071644_attorney_coordination_propagation_phase4.sql | none_live | 0/7 |
| 20260906163638 | attorney | 20260906163638_corrective_attorney_lane_delegation.sql | partial_live | 1/7 |
| 20260907144347 | attorney | 20260907144347_attorney_matter_health_overview.sql | none_live | 0/10 |
| 20260907183523 | attorney | 20260907183523_attorney_workflow_refresh_signals.sql | none_live | 0/2 |
| 20260905101931 | bond_finance | 20260905101931_bond_application_portal_phase5_delivery_reminders.sql | partial_live | 1/11 |
| 20260905102430 | bond_finance | 20260905102430_bond_application_portal_phase6_document_continuity.sql | none_live | 0/9 |
| 20260905102813 | bond_finance | 20260905102813_bond_application_portal_phase7_submission_readiness.sql | none_live | 0/5 |
| 20260905102934 | bond_finance | 20260905102934_bond_application_portal_phase8_external_submission_record.sql | none_live | 0/5 |
| 20260906163535 | bond_finance | 20260906163535_corrective_bond_delivery_reminders.sql | partial_live | 1/11 |
| 20260905091122 | canonical_documents | 20260905091122_document_trust_phase3_role_scoped_projections.sql | none_live | 0/1 |
| 20260905095152 | canonical_documents | 20260905095152_document_trust_phase61_confirmed_remediation.sql | none_live | 0/2 |
| 20260901075131 | developer_referral | 20260901075131_public_development_landing_and_access_boundary.sql | partial_live | 10/11 |
| 20260901110612 | developer_referral | 20260901110612_development_organisation_relationship_foundation.sql | partial_live | 9/22 |
| 20260901170254 | developer_referral | 20260901170254_development_structure_hierarchy_phase2.sql | none_live | 0/14 |
| 20260901170909 | developer_referral | 20260901170909_development_product_catalogue_phase4.sql | none_live | 0/17 |
| 20260903122031 | developer_referral | 20260903122031_development_marketing_collaboration_foundation.sql | partial_live | 4/34 |
| 20260903130012 | developer_referral | 20260903130012_development_marketing_invite_delivery_phase5.sql | none_live | 0/7 |
| 20260906163601 | developer_referral | 20260906163601_corrective_development_access_boundary.sql | partial_live | 10/11 |
| 20260906163615 | developer_referral | 20260906163615_corrective_development_org_relationships.sql | partial_live | 9/22 |
| 20260906163622 | developer_referral | 20260906163622_corrective_development_marketing_collaboration.sql | partial_live | 4/34 |
| 20260820193436 | lead_capture_crm | 20260820193436_admin_dashboard_exact_active_listing_tokens.sql | none_live | 0/1 |
| 202608290001 | lead_capture_crm | 202608290001_lead_multi_agent_assignments.sql | none_live | 0/6 |
| 20260829204153 | lead_capture_crm | 20260829204153_seller_onboarding_completion_receipt_and_projection_rls.sql | partial_live | 1/3 |
| 20260905125639 | lead_capture_crm | 20260905125639_rental_application_lead_linkage.sql | partial_live | 1/2 |
| 20260906163555 | lead_capture_crm | 20260906163555_corrective_seller_onboarding_receipt.sql | partial_live | 1/3 |
| 20260906163629 | lead_capture_crm | 20260906163629_corrective_rental_application_lead_linkage.sql | partial_live | 1/2 |
| 202608200001 | other | 202608200001_whatsapp_integration_foundation.sql | partial_live | 2/20 |
| 20260820160621 | other | 20260820160621_journey_stage_overrides_phase2.sql | none_live | 0/9 |
| 202608290002 | other | 202608290002_client_compliance_verification.sql | none_live | 0/12 |
| 20260831150740 | other | 20260831150740_property24_live_cutover_gate.sql | none_live | 0/6 |
| 20260831190341 | other | 20260831190341_compatibility_fallback_retirement_telemetry.sql | none_live | 0/2 |
| 20260901174924 | other | 20260901174924_website_draft_page_authoring_phase7.sql | none_live | 0/5 |
| 20260905120250 | other | 20260905120250_rental_portal_foundation.sql | partial_live | 3/11 |
| 20260905141008 | other | 20260905141008_rental_portfolio_foundation.sql | none_live | 0/15 |
| 20260905141011 | other | 20260905141011_rental_evidence_foundation.sql | none_live | 0/11 |
| 20260906063435 | other | 20260906063435_public_websites_phase7_privilege_hardening.sql | none_live | 0/1 |
| 20260906065759 | other | 20260906065759_agent_phase2_rls_acceptance.sql | none_live | 0/6 |
| 20260906163540 | other | 20260906163540_corrective_whatsapp_foundation.sql | partial_live | 2/20 |
| 20260906163617 | other | 20260906163617_corrective_rental_portal_foundation.sql | partial_live | 3/11 |
| 20260827083108 | transaction_network | 20260827083108_normalize_transaction_participant_statuses.sql | partial_live | 1/3 |
| 20260829103738 | transaction_network | 20260829103738_transaction_sync_phase2_canonical_propagation.sql | none_live | 0/14 |
| 20260829105514 | transaction_network | 20260829105514_transaction_sync_phase3_module_adapters.sql | none_live | 0/2 |
| 20260829111644 | transaction_network | 20260829111644_transaction_sync_phase6_controlled_recovery.sql | none_live | 0/4 |
| 20260829112135 | transaction_network | 20260829112135_transaction_sync_phase7_canary_certification.sql | none_live | 0/4 |
| 20260829112530 | transaction_network | 20260829112530_transaction_sync_phase8_fleet_release_gate.sql | none_live | 0/3 |
| 20260906163551 | transaction_network | 20260906163551_corrective_transaction_participant_statuses.sql | partial_live | 1/3 |
| 202608230001 | workspace_platform | 202608230001_agency_onboarding_flow.sql | partial_live | 1/15 |
| 20260906163545 | workspace_platform | 20260906163545_corrective_agency_onboarding.sql | partial_live | 1/15 |
| 20260907154525 | workspace_platform | 20260907154525_organisation_permission_integrity_audit_phase1.sql | none_live | 0/1 |
| 20260907154858 | workspace_platform | 20260907154858_organisation_permission_integrity_repair_phase2.sql | partial_live | 1/4 |
| 20260907155220 | workspace_platform | 20260907155220_onboarding_primary_owner_source_phase3.sql | none_live | 0/1 |
| 20260907155543 | workspace_platform | 20260907155543_organisation_primary_owner_control_phase4.sql | none_live | 0/2 |
| 20260907155750 | workspace_platform | 20260907155750_organisation_ownership_health_phase5.sql | none_live | 0/1 |
| 20260907155942 | workspace_platform | 20260907155942_organisation_ownership_manual_review_queue_phase6.sql | none_live | 0/1 |
| 20260907190000 | workspace_platform | 20260907190000_buyer_profile_reuse_phase1.sql | none_live | 0/10 |

## Application Manifest

This is a conservative staging manifest, not authorization to apply SQL. `Depends On` expresses ordering within the inferred deployment stream; every stream still requires a live prerequisite check.

| Action | Count |
| --- | --- |
| apply_original_after_dependency_check | 45 |
| corrective_migration_required | 12 |
| manual_data_review | 20 |
| repair_only_after_smoke | 46 |

| Version | Stream | Depends On | Module | File | Evidence | Action | Required Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 20260905101931 | bond_finance_runtime | stream preflight | bond_finance | 20260905101931_bond_application_portal_phase5_delivery_reminders.sql | partial_live (1/11) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 20260905102430 | bond_finance_runtime | 20260905101931 | bond_finance | 20260905102430_bond_application_portal_phase6_document_continuity.sql | none_live (0/9) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260905102813 | bond_finance_runtime | 20260905102430 | bond_finance | 20260905102813_bond_application_portal_phase7_submission_readiness.sql | none_live (0/5) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260905102934 | bond_finance_runtime | 20260905102813 | bond_finance | 20260905102934_bond_application_portal_phase8_external_submission_record.sql | none_live (0/5) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260903094957 | attorney_identity_access | stream preflight | attorney | 20260903094957_retire_inactive_attorney_assignments.sql | all_live (2/2) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260907183523 | attorney_workflow_runtime | stream preflight | attorney | 20260907183523_attorney_workflow_refresh_signals.sql | none_live (0/2) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260908065905 | attorney_workflow_runtime | 20260907183523 | attorney | 20260908065905_publish_attorney_workflow_plan_reconciliation.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 202608200001 | other | stream preflight | other | 202608200001_whatsapp_integration_foundation.sql | partial_live (2/20) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 202608200002 | other | 202608200001 | canonical_documents | 202608200002_whatsapp_template_seed.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260820160621 | other | 202608200002 | other | 20260820160621_journey_stage_overrides_phase2.sql | none_live (0/9) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260820174624 | other | 20260820160621 | workspace_platform | 20260820174624_admin_dashboard_units_as_listings.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260820192038 | other | 20260820174624 | workspace_platform | 20260820192038_admin_dashboard_external_inventory_snapshots.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260820192857 | other | 20260820192038 | workspace_platform | 20260820192857_remove_admin_external_inventory_counts.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260820193436 | other | 20260820192857 | lead_capture_crm | 20260820193436_admin_dashboard_exact_active_listing_tokens.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202608230001 | other | 20260820193436 | workspace_platform | 202608230001_agency_onboarding_flow.sql | partial_live (1/15) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 202608230002 | other | 202608230001 | transaction_network | 202608230002_transaction_sale_profile_phase1.sql | all_live (4/4) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202608240001 | other | 202608230002 | workspace_platform | 202608240001_prospect_demo_configs.sql | all_live (7/7) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260824084233 | other | 202608240001 | workspace_platform | 20260824084233_add_prospect_demo_brand_colours.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260824091732 | other | 20260824084233 | workspace_platform | 20260824091732_align_prospect_demo_admin_rls.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260824092531 | other | 20260824091732 | workspace_platform | 20260824092531_add_prospect_demo_light_dark_logos.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 202608250001 | other | 20260824092531 | commercial | 202608250001_remove_listing_mandate_activation_guards.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260827081713 | other | 202608250001 | transaction_network | 20260827081713_normalize_transaction_participant_assignment_sources.sql | all_live (3/3) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260827083108 | other | 20260827081713 | transaction_network | 20260827083108_normalize_transaction_participant_statuses.sql | partial_live (1/3) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 20260827091439 | other | 20260827083108 | transaction_network | 20260827091439_transaction_setup_owner_rls_access.sql | all_live (2/2) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202608290001 | other | 20260827091439 | lead_capture_crm | 202608290001_lead_multi_agent_assignments.sql | none_live (0/6) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202608290002 | other | 202608290001 | other | 202608290002_client_compliance_verification.sql | none_live (0/12) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260829103738 | other | 202608290002 | transaction_network | 20260829103738_transaction_sync_phase2_canonical_propagation.sql | none_live (0/14) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260829105514 | other | 20260829103738 | transaction_network | 20260829105514_transaction_sync_phase3_module_adapters.sql | none_live (0/2) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260829111644 | other | 20260829105514 | transaction_network | 20260829111644_transaction_sync_phase6_controlled_recovery.sql | none_live (0/4) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260829112135 | other | 20260829111644 | transaction_network | 20260829112135_transaction_sync_phase7_canary_certification.sql | none_live (0/4) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260829112530 | other | 20260829112135 | transaction_network | 20260829112530_transaction_sync_phase8_fleet_release_gate.sql | none_live (0/3) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260829195657 | other | 20260829112530 | lead_capture_crm | 20260829195657_seller_onboarding_link_fast_prepare.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260829204153 | other | 20260829195657 | lead_capture_crm | 20260829204153_seller_onboarding_completion_receipt_and_projection_rls.sql | partial_live (1/3) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 20260830125035 | other | 20260829204153 | attorney | 20260830125035_attorney_dashboard_rpc_hot_path.sql | all_live (2/2) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260830160810 | other | 20260830125035 | other | 20260830160810_secure_auth_bootstrap_rpc.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260831065240 | other | 20260830160810 | workspace_platform | 20260831065240_correct_staging_sale_profile_backfill.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260831071807 | other | 20260831065240 | transaction_network | 20260831071807_canonical_transaction_requirements_on_creation.sql | all_live (2/2) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260831072652 | other | 20260831071807 | transaction_network | 20260831072652_canonical_transaction_requirements_on_creation.sql | all_live (2/2) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260831074347 | other | 20260831072652 | developer_referral | 20260831074347_developer_document_portal_deny_direct_access.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260831090414 | other | 20260831074347 | attorney | 20260831090414_attorney_matter_list_read_model_phase3_staging_catchup.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260831120000 | other | 20260831090414 | lead_capture_crm | 20260831120000_property24_migration_listing_media_storage.sql | all_live (4/4) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260831131538 | other | 20260831120000 | transaction_network | 20260831131538_property24_canonical_connection_backfill.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260831140736 | other | 20260831131538 | other | 20260831140736_property24_agent_catalog_mappings.sql | all_live (12/12) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260831150740 | other | 20260831140736 | other | 20260831150740_property24_live_cutover_gate.sql | none_live (0/6) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260831153322 | other | 20260831150740 | other | 20260831153322_staging_rls_warning_view_hardening.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260831190341 | other | 20260831153322 | other | 20260831190341_compatibility_fallback_retirement_telemetry.sql | none_live (0/2) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260901075131 | other | 20260831190341 | developer_referral | 20260901075131_public_development_landing_and_access_boundary.sql | partial_live (10/11) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 20260901110612 | other | 20260901075131 | developer_referral | 20260901110612_development_organisation_relationship_foundation.sql | partial_live (9/22) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 20260901140943 | other | 20260901110612 | workspace_platform | 20260901140943_harden_admin_portal_authorization.sql | all_live (3/3) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260901143358 | other | 20260901140943 | lead_capture_crm | 20260901143358_property24_category_listing_facts.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260901145225 | other | 20260901143358 | commercial | 20260901145225_property24_commercial_canonical_backfill.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260901165511 | other | 20260901145225 | other | 20260901165511_website_publication_workflow_phase6.sql | all_live (3/3) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260901170254 | other | 20260901165511 | developer_referral | 20260901170254_development_structure_hierarchy_phase2.sql | none_live (0/14) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260901170909 | other | 20260901170254 | developer_referral | 20260901170909_development_product_catalogue_phase4.sql | none_live (0/17) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260901174924 | other | 20260901170909 | other | 20260901174924_website_draft_page_authoring_phase7.sql | none_live (0/5) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260902095249 | other | 20260901174924 | developer_referral | 20260902095249_public_development_organisation_branding.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260902105303 | other | 20260902095249 | developer_referral | 20260902105303_public_development_high_contrast_branding.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260903094624 | other | 20260902105303 | workspace_platform | 20260903094624_organisation_workspace_lock.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260903122031 | other | 20260903094624 | developer_referral | 20260903122031_development_marketing_collaboration_foundation.sql | partial_live (4/34) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 20260903130012 | other | 20260903122031 | developer_referral | 20260903130012_development_marketing_invite_delivery_phase5.sql | none_live (0/7) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260905090353 | other | 20260903130012 | lead_capture_crm | 20260905090353_document_trust_phase1_seller_atomic_link.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260905091122 | other | 20260905090353 | canonical_documents | 20260905091122_document_trust_phase3_role_scoped_projections.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260905095152 | other | 20260905091122 | canonical_documents | 20260905095152_document_trust_phase61_confirmed_remediation.sql | none_live (0/2) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260905120250 | other | 20260905095152 | other | 20260905120250_rental_portal_foundation.sql | partial_live (3/11) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 20260905125639 | other | 20260905120250 | lead_capture_crm | 20260905125639_rental_application_lead_linkage.sql | partial_live (1/2) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 20260905141005 | other | 20260905125639 | other | 20260905141005_rental_property_foundation.sql | all_live (20/20) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260905141007 | other | 20260905141005 | other | 20260905141007_rental_unit_foundation.sql | all_live (16/16) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260905141008 | other | 20260905141007 | other | 20260905141008_rental_portfolio_foundation.sql | none_live (0/15) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260905141009 | other | 20260905141008 | commercial | 20260905141009_rental_landlord_mandate_foundation.sql | all_live (19/19) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260905141010 | other | 20260905141009 | commercial | 20260905141010_rental_vacancy_foundation.sql | all_live (15/15) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260905141011 | other | 20260905141010 | other | 20260905141011_rental_evidence_foundation.sql | none_live (0/11) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260905141012 | other | 20260905141011 | commercial | 20260905141012_rental_vacancy_marketing_foundation.sql | all_live (9/9) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260905141013 | other | 20260905141012 | other | 20260905141013_rental_internal_marketing_operations.sql | all_live (14/14) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260905141014 | other | 20260905141013 | other | 20260905141014_rental_applications_and_applicant_access.sql | all_live (9/9) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260905141015 | other | 20260905141014 | other | 20260905141015_rental_application_submission.sql | all_live (2/2) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260905141016 | other | 20260905141015 | other | 20260905141016_rental_application_documents.sql | all_live (3/3) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260905141017 | other | 20260905141016 | workspace_platform | 20260905141017_rental_application_review_workspace.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260905141018 | other | 20260905141017 | other | 20260905141018_rental_application_screening.sql | all_live (11/11) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260905141019 | other | 20260905141018 | other | 20260905141019_rental_application_screening_reviewer_actor.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260905141020 | other | 20260905141019 | other | 20260905141020_rental_application_decisions.sql | all_live (13/13) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260905141021 | other | 20260905141020 | other | 20260905141021_rental_application_tenancy_conversion.sql | all_live (13/13) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260905150420 | other | 20260905141021 | developer_referral | 20260905150420_development_visual_analytics_phase14.sql | all_live (8/8) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260906063435 | other | 20260905150420 | other | 20260906063435_public_websites_phase7_privilege_hardening.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260906065759 | other | 20260906063435 | other | 20260906065759_agent_phase2_rls_acceptance.sql | none_live (0/6) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260906070515 | other | 20260906065759 | attorney | 20260906070515_attorney_coordination_nomination_phase2.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260906070938 | other | 20260906070515 | attorney | 20260906070938_attorney_lane_delegation_phase3.sql | partial_live (1/7) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 20260906071644 | other | 20260906070938 | attorney | 20260906071644_attorney_coordination_propagation_phase4.sql | none_live (0/7) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260906123000 | other | 20260906071644 | other | 20260906123000_public_websites_pilot_closeout_phase5_go_live.sql | all_live (6/6) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260906130000 | other | 20260906123000 | lead_capture_crm | 20260906130000_meta_lead_ads_integration.sql | all_live (11/11) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260906133000 | other | 20260906130000 | other | 20260906133000_public_websites_pilot_closeout_phase6_hypercare.sql | all_live (27/27) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260906134500 | other | 20260906133000 | other | 20260906134500_public_websites_pilot_closeout_phase6_hypercare_indexes.sql | all_live (5/5) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260906140000 | other | 20260906134500 | other | 20260906140000_public_websites_pilot_closeout_phase6_approval_gate.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260906163535 | other | 20260906140000 | bond_finance | 20260906163535_corrective_bond_delivery_reminders.sql | partial_live (1/11) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260906163540 | other | 20260906163535 | other | 20260906163540_corrective_whatsapp_foundation.sql | partial_live (2/20) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260906163545 | other | 20260906163540 | workspace_platform | 20260906163545_corrective_agency_onboarding.sql | partial_live (1/15) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260906163551 | other | 20260906163545 | transaction_network | 20260906163551_corrective_transaction_participant_statuses.sql | partial_live (1/3) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260906163555 | other | 20260906163551 | lead_capture_crm | 20260906163555_corrective_seller_onboarding_receipt.sql | partial_live (1/3) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260906163601 | other | 20260906163555 | developer_referral | 20260906163601_corrective_development_access_boundary.sql | partial_live (10/11) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260906163615 | other | 20260906163601 | developer_referral | 20260906163615_corrective_development_org_relationships.sql | partial_live (9/22) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260906163617 | other | 20260906163615 | other | 20260906163617_corrective_rental_portal_foundation.sql | partial_live (3/11) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260906163622 | other | 20260906163617 | developer_referral | 20260906163622_corrective_development_marketing_collaboration.sql | partial_live (4/34) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260906163629 | other | 20260906163622 | lead_capture_crm | 20260906163629_corrective_rental_application_lead_linkage.sql | partial_live (1/2) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260906163638 | other | 20260906163629 | attorney | 20260906163638_corrective_attorney_lane_delegation.sql | partial_live (1/7) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260906173716 | other | 20260906163638 | lead_capture_crm | 20260906173716_add_meta_lead_form_type.sql | all_live (2/2) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260906175502 | other | 20260906173716 | lead_capture_crm | 20260906175502_meta_lead_ads_backfill_foundation.sql | all_live (11/11) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260906190137 | other | 20260906175502 | canonical_documents | 20260906190137_public_websites_home_seekers_template.sql | all_live (2/2) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260906203500 | other | 20260906190137 | transaction_network | 20260906203500_public_websites_phase5_primary_principal_routing.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260907143356 | other | 20260906203500 | attorney | 20260907143356_repair_attorney_branding_storage_metadata.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260907144347 | other | 20260907143356 | attorney | 20260907144347_attorney_matter_health_overview.sql | none_live (0/10) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260907154525 | other | 20260907144347 | workspace_platform | 20260907154525_organisation_permission_integrity_audit_phase1.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260907154858 | other | 20260907154525 | workspace_platform | 20260907154858_organisation_permission_integrity_repair_phase2.sql | partial_live (1/4) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 20260907155000 | other | 20260907154858 | attorney | 20260907155000_attorney_matter_property_identity_repair.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260907155220 | other | 20260907155000 | workspace_platform | 20260907155220_onboarding_primary_owner_source_phase3.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260907155543 | other | 20260907155220 | workspace_platform | 20260907155543_organisation_primary_owner_control_phase4.sql | none_live (0/2) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260907155750 | other | 20260907155543 | workspace_platform | 20260907155750_organisation_ownership_health_phase5.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260907155942 | other | 20260907155750 | workspace_platform | 20260907155942_organisation_ownership_manual_review_queue_phase6.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260907162000 | other | 20260907155942 | attorney | 20260907162000_attorney_dashboard_property_identity_backfill.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260907180410 | other | 20260907162000 | lead_capture_crm | 20260907180410_reconcile_private_seller_handoff_defaults.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260907190000 | other | 20260907180410 | workspace_platform | 20260907190000_buyer_profile_reuse_phase1.sql | none_live (0/10) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 20260907193000 | other | 20260907190000 | transaction_network | 20260907193000_transaction_buyer_parties_phase3.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260907194208 | other | 20260907193000 | transaction_network | 20260907194208_repair_transaction_workspace_core.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 20260907194623 | other | 20260907194208 | other | 20260907194623_repair_deal_setup_schema_compatibility.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 20260908064347 | other | 20260907194623 | attorney | 20260908064347_align_attorney_lane_progress_with_matter_plan.sql | all_live (1/1) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |

## Local-Only Drift Detail

| Version | Bucket | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- | --- |
| 20260830125035 | pure_local_only | attorney | 20260830125035_attorney_dashboard_rpc_hot_path.sql | all_live | 2/2 |
| 20260831090414 | pure_local_only | attorney | 20260831090414_attorney_matter_list_read_model_phase3_staging_catchup.sql | all_live | 1/1 |
| 20260903094957 | pure_local_only | attorney | 20260903094957_retire_inactive_attorney_assignments.sql | all_live | 2/2 |
| 20260906070515 | pure_local_only | attorney | 20260906070515_attorney_coordination_nomination_phase2.sql | none_live | 0/1 |
| 20260906070938 | pure_local_only | attorney | 20260906070938_attorney_lane_delegation_phase3.sql | partial_live | 1/7 |
| 20260906071644 | pure_local_only | attorney | 20260906071644_attorney_coordination_propagation_phase4.sql | none_live | 0/7 |
| 20260906163638 | pure_local_only | attorney | 20260906163638_corrective_attorney_lane_delegation.sql | partial_live | 1/7 |
| 20260907143356 | pure_local_only | attorney | 20260907143356_repair_attorney_branding_storage_metadata.sql | no_static_objects | n/a |
| 20260907144347 | pure_local_only | attorney | 20260907144347_attorney_matter_health_overview.sql | none_live | 0/10 |
| 20260907155000 | pure_local_only | attorney | 20260907155000_attorney_matter_property_identity_repair.sql | no_static_objects | n/a |
| 20260907162000 | pure_local_only | attorney | 20260907162000_attorney_dashboard_property_identity_backfill.sql | no_static_objects | n/a |
| 20260907183523 | pure_local_only | attorney | 20260907183523_attorney_workflow_refresh_signals.sql | none_live | 0/2 |
| 20260908064347 | pure_local_only | attorney | 20260908064347_align_attorney_lane_progress_with_matter_plan.sql | all_live | 1/1 |
| 20260908065905 | pure_local_only | attorney | 20260908065905_publish_attorney_workflow_plan_reconciliation.sql | no_static_objects | n/a |
| 20260905101931 | pure_local_only | bond_finance | 20260905101931_bond_application_portal_phase5_delivery_reminders.sql | partial_live | 1/11 |
| 20260905102430 | pure_local_only | bond_finance | 20260905102430_bond_application_portal_phase6_document_continuity.sql | none_live | 0/9 |
| 20260905102813 | pure_local_only | bond_finance | 20260905102813_bond_application_portal_phase7_submission_readiness.sql | none_live | 0/5 |
| 20260905102934 | pure_local_only | bond_finance | 20260905102934_bond_application_portal_phase8_external_submission_record.sql | none_live | 0/5 |
| 20260906163535 | pure_local_only | bond_finance | 20260906163535_corrective_bond_delivery_reminders.sql | partial_live | 1/11 |
| 202608200002 | pure_local_only | canonical_documents | 202608200002_whatsapp_template_seed.sql | no_static_objects | n/a |
| 20260905091122 | pure_local_only | canonical_documents | 20260905091122_document_trust_phase3_role_scoped_projections.sql | none_live | 0/1 |
| 20260905095152 | pure_local_only | canonical_documents | 20260905095152_document_trust_phase61_confirmed_remediation.sql | none_live | 0/2 |
| 20260906190137 | pure_local_only | canonical_documents | 20260906190137_public_websites_home_seekers_template.sql | all_live | 2/2 |
| 202608250001 | pure_local_only | commercial | 202608250001_remove_listing_mandate_activation_guards.sql | no_static_objects | n/a |
| 20260901145225 | pure_local_only | commercial | 20260901145225_property24_commercial_canonical_backfill.sql | no_static_objects | n/a |
| 20260905141009 | pure_local_only | commercial | 20260905141009_rental_landlord_mandate_foundation.sql | all_live | 19/19 |
| 20260905141010 | pure_local_only | commercial | 20260905141010_rental_vacancy_foundation.sql | all_live | 15/15 |
| 20260905141012 | pure_local_only | commercial | 20260905141012_rental_vacancy_marketing_foundation.sql | all_live | 9/9 |
| 20260831074347 | pure_local_only | developer_referral | 20260831074347_developer_document_portal_deny_direct_access.sql | all_live | 1/1 |
| 20260901075131 | pure_local_only | developer_referral | 20260901075131_public_development_landing_and_access_boundary.sql | partial_live | 10/11 |
| 20260901110612 | pure_local_only | developer_referral | 20260901110612_development_organisation_relationship_foundation.sql | partial_live | 9/22 |
| 20260901170254 | pure_local_only | developer_referral | 20260901170254_development_structure_hierarchy_phase2.sql | none_live | 0/14 |
| 20260901170909 | pure_local_only | developer_referral | 20260901170909_development_product_catalogue_phase4.sql | none_live | 0/17 |
| 20260902095249 | pure_local_only | developer_referral | 20260902095249_public_development_organisation_branding.sql | all_live | 1/1 |
| 20260902105303 | pure_local_only | developer_referral | 20260902105303_public_development_high_contrast_branding.sql | all_live | 1/1 |
| 20260903122031 | pure_local_only | developer_referral | 20260903122031_development_marketing_collaboration_foundation.sql | partial_live | 4/34 |
| 20260903130012 | pure_local_only | developer_referral | 20260903130012_development_marketing_invite_delivery_phase5.sql | none_live | 0/7 |
| 20260905150420 | pure_local_only | developer_referral | 20260905150420_development_visual_analytics_phase14.sql | all_live | 8/8 |
| 20260906163601 | pure_local_only | developer_referral | 20260906163601_corrective_development_access_boundary.sql | partial_live | 10/11 |
| 20260906163615 | pure_local_only | developer_referral | 20260906163615_corrective_development_org_relationships.sql | partial_live | 9/22 |
| 20260906163622 | pure_local_only | developer_referral | 20260906163622_corrective_development_marketing_collaboration.sql | partial_live | 4/34 |
| 20260820193436 | pure_local_only | lead_capture_crm | 20260820193436_admin_dashboard_exact_active_listing_tokens.sql | none_live | 0/1 |
| 202608290001 | pure_local_only | lead_capture_crm | 202608290001_lead_multi_agent_assignments.sql | none_live | 0/6 |
| 20260829195657 | pure_local_only | lead_capture_crm | 20260829195657_seller_onboarding_link_fast_prepare.sql | all_live | 1/1 |
| 20260829204153 | pure_local_only | lead_capture_crm | 20260829204153_seller_onboarding_completion_receipt_and_projection_rls.sql | partial_live | 1/3 |
| 20260831120000 | pure_local_only | lead_capture_crm | 20260831120000_property24_migration_listing_media_storage.sql | all_live | 4/4 |
| 20260901143358 | pure_local_only | lead_capture_crm | 20260901143358_property24_category_listing_facts.sql | no_static_objects | n/a |
| 202609030001 | split_local_remote | lead_capture_crm | 202609030001_header_lead_notification_source.sql | all_live | 1/1 |
| 20260905090353 | pure_local_only | lead_capture_crm | 20260905090353_document_trust_phase1_seller_atomic_link.sql | all_live | 1/1 |
| 20260905125639 | pure_local_only | lead_capture_crm | 20260905125639_rental_application_lead_linkage.sql | partial_live | 1/2 |
| 20260906130000 | pure_local_only | lead_capture_crm | 20260906130000_meta_lead_ads_integration.sql | all_live | 11/11 |
| 20260906163555 | pure_local_only | lead_capture_crm | 20260906163555_corrective_seller_onboarding_receipt.sql | partial_live | 1/3 |
| 20260906163629 | pure_local_only | lead_capture_crm | 20260906163629_corrective_rental_application_lead_linkage.sql | partial_live | 1/2 |
| 20260906173716 | pure_local_only | lead_capture_crm | 20260906173716_add_meta_lead_form_type.sql | all_live | 2/2 |
| 20260906175502 | pure_local_only | lead_capture_crm | 20260906175502_meta_lead_ads_backfill_foundation.sql | all_live | 11/11 |
| 20260907180410 | pure_local_only | lead_capture_crm | 20260907180410_reconcile_private_seller_handoff_defaults.sql | no_static_objects | n/a |
| 202608200001 | pure_local_only | other | 202608200001_whatsapp_integration_foundation.sql | partial_live | 2/20 |
| 20260820160621 | pure_local_only | other | 20260820160621_journey_stage_overrides_phase2.sql | none_live | 0/9 |
| 202608290002 | pure_local_only | other | 202608290002_client_compliance_verification.sql | none_live | 0/12 |
| 20260830160810 | pure_local_only | other | 20260830160810_secure_auth_bootstrap_rpc.sql | no_static_objects | n/a |
| 20260831140736 | pure_local_only | other | 20260831140736_property24_agent_catalog_mappings.sql | all_live | 12/12 |
| 20260831150740 | pure_local_only | other | 20260831150740_property24_live_cutover_gate.sql | none_live | 0/6 |
| 20260831153322 | pure_local_only | other | 20260831153322_staging_rls_warning_view_hardening.sql | no_static_objects | n/a |
| 20260831190341 | pure_local_only | other | 20260831190341_compatibility_fallback_retirement_telemetry.sql | none_live | 0/2 |
| 20260901165511 | pure_local_only | other | 20260901165511_website_publication_workflow_phase6.sql | all_live | 3/3 |
| 20260901174924 | pure_local_only | other | 20260901174924_website_draft_page_authoring_phase7.sql | none_live | 0/5 |
| 20260905120250 | pure_local_only | other | 20260905120250_rental_portal_foundation.sql | partial_live | 3/11 |
| 20260905141005 | pure_local_only | other | 20260905141005_rental_property_foundation.sql | all_live | 20/20 |
| 20260905141007 | pure_local_only | other | 20260905141007_rental_unit_foundation.sql | all_live | 16/16 |
| 20260905141008 | pure_local_only | other | 20260905141008_rental_portfolio_foundation.sql | none_live | 0/15 |
| 20260905141011 | pure_local_only | other | 20260905141011_rental_evidence_foundation.sql | none_live | 0/11 |
| 20260905141013 | pure_local_only | other | 20260905141013_rental_internal_marketing_operations.sql | all_live | 14/14 |
| 20260905141014 | pure_local_only | other | 20260905141014_rental_applications_and_applicant_access.sql | all_live | 9/9 |
| 20260905141015 | pure_local_only | other | 20260905141015_rental_application_submission.sql | all_live | 2/2 |
| 20260905141016 | pure_local_only | other | 20260905141016_rental_application_documents.sql | all_live | 3/3 |
| 20260905141018 | pure_local_only | other | 20260905141018_rental_application_screening.sql | all_live | 11/11 |
| 20260905141019 | pure_local_only | other | 20260905141019_rental_application_screening_reviewer_actor.sql | all_live | 1/1 |
| 20260905141020 | pure_local_only | other | 20260905141020_rental_application_decisions.sql | all_live | 13/13 |
| 20260905141021 | pure_local_only | other | 20260905141021_rental_application_tenancy_conversion.sql | all_live | 13/13 |
| 20260906063435 | pure_local_only | other | 20260906063435_public_websites_phase7_privilege_hardening.sql | none_live | 0/1 |
| 20260906065759 | pure_local_only | other | 20260906065759_agent_phase2_rls_acceptance.sql | none_live | 0/6 |
| 20260906123000 | pure_local_only | other | 20260906123000_public_websites_pilot_closeout_phase5_go_live.sql | all_live | 6/6 |
| 20260906133000 | pure_local_only | other | 20260906133000_public_websites_pilot_closeout_phase6_hypercare.sql | all_live | 27/27 |
| 20260906134500 | pure_local_only | other | 20260906134500_public_websites_pilot_closeout_phase6_hypercare_indexes.sql | all_live | 5/5 |
| 20260906140000 | pure_local_only | other | 20260906140000_public_websites_pilot_closeout_phase6_approval_gate.sql | all_live | 1/1 |
| 20260906163540 | pure_local_only | other | 20260906163540_corrective_whatsapp_foundation.sql | partial_live | 2/20 |
| 20260906163617 | pure_local_only | other | 20260906163617_corrective_rental_portal_foundation.sql | partial_live | 3/11 |
| 20260907194623 | pure_local_only | other | 20260907194623_repair_deal_setup_schema_compatibility.sql | all_live | 1/1 |
| 202608230002 | pure_local_only | transaction_network | 202608230002_transaction_sale_profile_phase1.sql | all_live | 4/4 |
| 20260827081713 | pure_local_only | transaction_network | 20260827081713_normalize_transaction_participant_assignment_sources.sql | all_live | 3/3 |
| 20260827083108 | pure_local_only | transaction_network | 20260827083108_normalize_transaction_participant_statuses.sql | partial_live | 1/3 |
| 20260827091439 | pure_local_only | transaction_network | 20260827091439_transaction_setup_owner_rls_access.sql | all_live | 2/2 |
| 20260829103738 | pure_local_only | transaction_network | 20260829103738_transaction_sync_phase2_canonical_propagation.sql | none_live | 0/14 |
| 20260829105514 | pure_local_only | transaction_network | 20260829105514_transaction_sync_phase3_module_adapters.sql | none_live | 0/2 |
| 20260829111644 | pure_local_only | transaction_network | 20260829111644_transaction_sync_phase6_controlled_recovery.sql | none_live | 0/4 |
| 20260829112135 | pure_local_only | transaction_network | 20260829112135_transaction_sync_phase7_canary_certification.sql | none_live | 0/4 |
| 20260829112530 | pure_local_only | transaction_network | 20260829112530_transaction_sync_phase8_fleet_release_gate.sql | none_live | 0/3 |
| 20260831071807 | pure_local_only | transaction_network | 20260831071807_canonical_transaction_requirements_on_creation.sql | all_live | 2/2 |
| 20260831072652 | pure_local_only | transaction_network | 20260831072652_canonical_transaction_requirements_on_creation.sql | all_live | 2/2 |
| 20260831131538 | pure_local_only | transaction_network | 20260831131538_property24_canonical_connection_backfill.sql | no_static_objects | n/a |
| 20260906163551 | pure_local_only | transaction_network | 20260906163551_corrective_transaction_participant_statuses.sql | partial_live | 1/3 |
| 20260906203500 | pure_local_only | transaction_network | 20260906203500_public_websites_phase5_primary_principal_routing.sql | no_static_objects | n/a |
| 20260907193000 | pure_local_only | transaction_network | 20260907193000_transaction_buyer_parties_phase3.sql | all_live | 1/1 |
| 20260907194208 | pure_local_only | transaction_network | 20260907194208_repair_transaction_workspace_core.sql | no_static_objects | n/a |
| 20260820174624 | pure_local_only | workspace_platform | 20260820174624_admin_dashboard_units_as_listings.sql | no_static_objects | n/a |
| 20260820192038 | pure_local_only | workspace_platform | 20260820192038_admin_dashboard_external_inventory_snapshots.sql | no_static_objects | n/a |
| 20260820192857 | pure_local_only | workspace_platform | 20260820192857_remove_admin_external_inventory_counts.sql | no_static_objects | n/a |
| 202608230001 | pure_local_only | workspace_platform | 202608230001_agency_onboarding_flow.sql | partial_live | 1/15 |
| 202608240001 | pure_local_only | workspace_platform | 202608240001_prospect_demo_configs.sql | all_live | 7/7 |
| 20260824084233 | pure_local_only | workspace_platform | 20260824084233_add_prospect_demo_brand_colours.sql | no_static_objects | n/a |
| 20260824091732 | pure_local_only | workspace_platform | 20260824091732_align_prospect_demo_admin_rls.sql | all_live | 1/1 |
| 20260824092531 | pure_local_only | workspace_platform | 20260824092531_add_prospect_demo_light_dark_logos.sql | no_static_objects | n/a |
| 20260831065240 | pure_local_only | workspace_platform | 20260831065240_correct_staging_sale_profile_backfill.sql | no_static_objects | n/a |
| 20260901140943 | pure_local_only | workspace_platform | 20260901140943_harden_admin_portal_authorization.sql | all_live | 3/3 |
| 20260903094624 | pure_local_only | workspace_platform | 20260903094624_organisation_workspace_lock.sql | all_live | 1/1 |
| 20260905141017 | pure_local_only | workspace_platform | 20260905141017_rental_application_review_workspace.sql | all_live | 1/1 |
| 20260906163545 | pure_local_only | workspace_platform | 20260906163545_corrective_agency_onboarding.sql | partial_live | 1/15 |
| 20260907154525 | pure_local_only | workspace_platform | 20260907154525_organisation_permission_integrity_audit_phase1.sql | none_live | 0/1 |
| 20260907154858 | pure_local_only | workspace_platform | 20260907154858_organisation_permission_integrity_repair_phase2.sql | partial_live | 1/4 |
| 20260907155220 | pure_local_only | workspace_platform | 20260907155220_onboarding_primary_owner_source_phase3.sql | none_live | 0/1 |
| 20260907155543 | pure_local_only | workspace_platform | 20260907155543_organisation_primary_owner_control_phase4.sql | none_live | 0/2 |
| 20260907155750 | pure_local_only | workspace_platform | 20260907155750_organisation_ownership_health_phase5.sql | none_live | 0/1 |
| 20260907155942 | pure_local_only | workspace_platform | 20260907155942_organisation_ownership_manual_review_queue_phase6.sql | none_live | 0/1 |
| 20260907190000 | pure_local_only | workspace_platform | 20260907190000_buyer_profile_reuse_phase1.sql | none_live | 0/10 |

## Object Extraction

| Metric | Value |
| --- | --- |
| Static objects extracted | 756 |
| Catalog rows returned | 756 |
| Object check command | ok |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase5-object-checks-85983.sql --output-format json | ok | Initialising login role... |

## Next Step

Use this module matrix to choose the next small repair batch. Any unreviewed split ledger row must be investigated first; reviewed baseline rows remain excluded from repair batches. Pure local-only rows need module smoke evidence before any `migration repair`.

