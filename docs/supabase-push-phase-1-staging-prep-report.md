# Supabase Push Phase 1 Staging Prep Report

Generated: 2026-09-06T15:54:49.832Z

## Scope

Phase 1 prepares the staging evidence package for the migration push path. It does not apply SQL, repair any ledger, relink the Supabase project, or modify production.

## Outputs

- `docs/supabase-push-phase-1-staging-evidence-templates.json`
- `docs/supabase-push-phase-1-staging-prep-report.md`

## Manifest Summary

| Field | Value |
| --- | --- |
| Manifest rows | 95 |
| Runner-eligible rows | 71 |
| Blocked rows requiring corrective/manual work | 24 |

## Streams

| Stream | Rows |
| --- | --- |
| `attorney_identity_access` | 1 |
| `bond_finance_runtime` | 8 |
| `other` | 86 |

## Actions

| Action | Rows |
| --- | --- |
| `apply_original_after_dependency_check` | 31 |
| `corrective_migration_required` | 11 |
| `manual_data_review` | 13 |
| `repair_only_after_smoke` | 40 |

## Runner Eligibility

| Eligibility | Rows |
| --- | --- |
| `blocked_create_corrective_migration` | 11 |
| `blocked_manual_data_review` | 13 |
| `staging_apply_then_record` | 31 |
| `staging_record_only_after_smoke` | 40 |

## Work Queue

| Version | Stream | Action | Object Status | Eligibility | File |
| --- | --- | --- | --- | --- | --- |
| `20260828203724` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260828203724_bond_application_idempotent_document_reconciliation.sql` |
| `20260905100612` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260905100612_bond_application_portal_phase2_access_tokens.sql` |
| `20260905100908` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260905100908_bond_application_portal_phase3_draft_editing.sql` |
| `20260905101301` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260905101301_bond_application_portal_phase4_originator_action_centre.sql` |
| `20260905101931` | `bond_finance_runtime` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `20260905101931_bond_application_portal_phase5_delivery_reminders.sql` |
| `20260905102430` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260905102430_bond_application_portal_phase6_document_continuity.sql` |
| `20260905102813` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260905102813_bond_application_portal_phase7_submission_readiness.sql` |
| `20260905102934` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260905102934_bond_application_portal_phase8_external_submission_record.sql` |
| `20260903094957` | `attorney_identity_access` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260903094957_retire_inactive_attorney_assignments.sql` |
| `20260817174624` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260817174624_arch9_inbound_leads_flow.sql` |
| `20260818203652` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260818203652_arch9_inbound_leads_snapshot_profile_shape.sql` |
| `202608200001` | `other` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `202608200001_whatsapp_integration_foundation.sql` |
| `202608200002` | `other` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `202608200002_whatsapp_template_seed.sql` |
| `20260820160621` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260820160621_journey_stage_overrides_phase2.sql` |
| `20260820174624` | `other` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `20260820174624_admin_dashboard_units_as_listings.sql` |
| `20260820192038` | `other` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `20260820192038_admin_dashboard_external_inventory_snapshots.sql` |
| `20260820192857` | `other` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `20260820192857_remove_admin_external_inventory_counts.sql` |
| `20260820193436` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260820193436_admin_dashboard_exact_active_listing_tokens.sql` |
| `202608230001` | `other` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `202608230001_agency_onboarding_flow.sql` |
| `202608230002` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `202608230002_transaction_sale_profile_phase1.sql` |
| `202608240001` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `202608240001_prospect_demo_configs.sql` |
| `20260824084233` | `other` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `20260824084233_add_prospect_demo_brand_colours.sql` |
| `20260824091732` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260824091732_align_prospect_demo_admin_rls.sql` |
| `20260824092531` | `other` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `20260824092531_add_prospect_demo_light_dark_logos.sql` |
| `202608250001` | `other` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `202608250001_remove_listing_mandate_activation_guards.sql` |
| `20260827081713` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260827081713_normalize_transaction_participant_assignment_sources.sql` |
| `20260827083108` | `other` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `20260827083108_normalize_transaction_participant_statuses.sql` |
| `20260827091439` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260827091439_transaction_setup_owner_rls_access.sql` |
| `202608290001` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202608290001_lead_multi_agent_assignments.sql` |
| `202608290002` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202608290002_client_compliance_verification.sql` |
| `20260829103738` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260829103738_transaction_sync_phase2_canonical_propagation.sql` |
| `20260829105514` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260829105514_transaction_sync_phase3_module_adapters.sql` |
| `20260829111644` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260829111644_transaction_sync_phase6_controlled_recovery.sql` |
| `20260829112135` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260829112135_transaction_sync_phase7_canary_certification.sql` |
| `20260829112530` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260829112530_transaction_sync_phase8_fleet_release_gate.sql` |
| `20260829195657` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260829195657_seller_onboarding_link_fast_prepare.sql` |
| `20260829204153` | `other` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `20260829204153_seller_onboarding_completion_receipt_and_projection_rls.sql` |
| `20260830125035` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260830125035_attorney_dashboard_rpc_hot_path.sql` |
| `20260830160810` | `other` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `20260830160810_secure_auth_bootstrap_rpc.sql` |
| `20260831071807` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260831071807_canonical_transaction_requirements_on_creation.sql` |
| `20260831072652` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260831072652_canonical_transaction_requirements_on_creation.sql` |
| `20260831120000` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260831120000_property24_migration_listing_media_storage.sql` |
| `20260831131538` | `other` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `20260831131538_property24_canonical_connection_backfill.sql` |
| `20260831140736` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260831140736_property24_agent_catalog_mappings.sql` |
| `20260831150740` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260831150740_property24_live_cutover_gate.sql` |
| `20260831153322` | `other` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `20260831153322_staging_rls_warning_view_hardening.sql` |
| `20260831190341` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260831190341_compatibility_fallback_retirement_telemetry.sql` |
| `20260901075131` | `other` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `20260901075131_public_development_landing_and_access_boundary.sql` |
| `20260901110612` | `other` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `20260901110612_development_organisation_relationship_foundation.sql` |
| `20260901140943` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260901140943_harden_admin_portal_authorization.sql` |
| `20260901143358` | `other` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `20260901143358_property24_category_listing_facts.sql` |
| `20260901145225` | `other` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `20260901145225_property24_commercial_canonical_backfill.sql` |
| `20260901165511` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260901165511_website_publication_workflow_phase6.sql` |
| `20260901170254` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260901170254_development_structure_hierarchy_phase2.sql` |
| `20260901170909` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260901170909_development_product_catalogue_phase4.sql` |
| `20260901174924` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260901174924_website_draft_page_authoring_phase7.sql` |
| `20260902074000` | `other` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `20260902074000_hide_non_building_harbour_heights_map_markers.sql` |
| `20260902085300` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260902085300_allow_platform_admin_profile_role.sql` |
| `20260902095249` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260902095249_public_development_organisation_branding.sql` |
| `20260902105303` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260902105303_public_development_high_contrast_branding.sql` |
| `20260903094624` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260903094624_organisation_workspace_lock.sql` |
| `20260903122031` | `other` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `20260903122031_development_marketing_collaboration_foundation.sql` |
| `20260903130012` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260903130012_development_marketing_invite_delivery_phase5.sql` |
| `20260905090353` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260905090353_document_trust_phase1_seller_atomic_link.sql` |
| `20260905091122` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260905091122_document_trust_phase3_role_scoped_projections.sql` |
| `20260905095152` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260905095152_document_trust_phase61_confirmed_remediation.sql` |
| `20260905120250` | `other` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `20260905120250_rental_portal_foundation.sql` |
| `20260905125639` | `other` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `20260905125639_rental_application_lead_linkage.sql` |
| `20260905141005` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260905141005_rental_property_foundation.sql` |
| `20260905141007` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260905141007_rental_unit_foundation.sql` |
| `20260905141008` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260905141008_rental_portfolio_foundation.sql` |
| `20260905141009` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260905141009_rental_landlord_mandate_foundation.sql` |
| `20260905141010` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260905141010_rental_vacancy_foundation.sql` |
| `20260905141011` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260905141011_rental_evidence_foundation.sql` |
| `20260905141012` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260905141012_rental_vacancy_marketing_foundation.sql` |
| `20260905141013` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260905141013_rental_internal_marketing_operations.sql` |
| `20260905141014` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260905141014_rental_applications_and_applicant_access.sql` |
| `20260905141015` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260905141015_rental_application_submission.sql` |
| `20260905141016` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260905141016_rental_application_documents.sql` |
| `20260905141017` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260905141017_rental_application_review_workspace.sql` |
| `20260905141018` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260905141018_rental_application_screening.sql` |
| `20260905141019` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260905141019_rental_application_screening_reviewer_actor.sql` |
| `20260905141020` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260905141020_rental_application_decisions.sql` |
| `20260905141021` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260905141021_rental_application_tenancy_conversion.sql` |
| `20260905150420` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260905150420_development_visual_analytics_phase14.sql` |
| `20260906063435` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260906063435_public_websites_phase7_privilege_hardening.sql` |
| `20260906065759` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260906065759_agent_phase2_rls_acceptance.sql` |
| `20260906070515` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260906070515_attorney_coordination_nomination_phase2.sql` |
| `20260906070938` | `other` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `20260906070938_attorney_lane_delegation_phase3.sql` |
| `20260906071644` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260906071644_attorney_coordination_propagation_phase4.sql` |
| `20260906123000` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260906123000_public_websites_pilot_closeout_phase5_go_live.sql` |
| `20260906130000` | `other` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `20260906130000_meta_lead_ads_integration.sql` |
| `20260906133000` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260906133000_public_websites_pilot_closeout_phase6_hypercare.sql` |
| `20260906134500` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260906134500_public_websites_pilot_closeout_phase6_hypercare_indexes.sql` |
| `20260906140000` | `other` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `20260906140000_public_websites_pilot_closeout_phase6_approval_gate.sql` |

## Required Environment Before Applying

```bash
export SUPABASE_STAGING_PROJECT_REF='<staging-project-ref>'
export SUPABASE_STAGING_DB_URL='postgresql://postgres:<password>@db.<staging-project-ref>.supabase.co:5432/postgres?sslmode=require'
export SUPABASE_STAGING_RECOVERY_CONFIRMED='I_HAVE_A_RECOVERABLE_STAGING_BACKUP'
```

Use `scripts/supabase-phase6-staging-execution.mjs` for staging. Do not use broad `supabase db push`.
