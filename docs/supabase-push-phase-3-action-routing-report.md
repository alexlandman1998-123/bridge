# Supabase Push Phase 3 Action Routing Report

Generated: 2026-09-06T15:54:49.699Z

## Scope

Phase 3 handles rows by action. It converts the phase 2 stream plans into explicit execution routes. This phase is read-only and does not apply SQL, record ledger rows, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Rows | 95 |
| Runner-eligible rows | 71 |
| Blocked rows | 24 |
| SQL-allowed rows | 31 |
| Ledger-allowed rows | 71 |

## Actions

| Action | Rows |
| --- | --- |
| `apply_original_after_dependency_check` | 31 |
| `corrective_migration_required` | 11 |
| `manual_data_review` | 13 |
| `repair_only_after_smoke` | 40 |

## Routes

| Route | Rows |
| --- | --- |
| `apply_original` | 31 |
| `corrective_required` | 11 |
| `manual_review` | 13 |
| `repair_only` | 40 |

## Work Queue

| Version | Stream | Action | Route | Blocked | SQL Allowed | Ledger Allowed | File |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `20260828203724` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260828203724_bond_application_idempotent_document_reconciliation.sql` |
| `20260905100612` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260905100612_bond_application_portal_phase2_access_tokens.sql` |
| `20260905100908` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260905100908_bond_application_portal_phase3_draft_editing.sql` |
| `20260905101301` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260905101301_bond_application_portal_phase4_originator_action_centre.sql` |
| `20260905101931` | `bond_finance_runtime` | `corrective_migration_required` | `corrective_required` | Yes | No | No | `20260905101931_bond_application_portal_phase5_delivery_reminders.sql` |
| `20260905102430` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260905102430_bond_application_portal_phase6_document_continuity.sql` |
| `20260905102813` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260905102813_bond_application_portal_phase7_submission_readiness.sql` |
| `20260905102934` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260905102934_bond_application_portal_phase8_external_submission_record.sql` |
| `20260903094957` | `attorney_identity_access` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260903094957_retire_inactive_attorney_assignments.sql` |
| `20260817174624` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260817174624_arch9_inbound_leads_flow.sql` |
| `20260818203652` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260818203652_arch9_inbound_leads_snapshot_profile_shape.sql` |
| `202608200001` | `other` | `corrective_migration_required` | `corrective_required` | Yes | No | No | `202608200001_whatsapp_integration_foundation.sql` |
| `202608200002` | `other` | `manual_data_review` | `manual_review` | Yes | No | No | `202608200002_whatsapp_template_seed.sql` |
| `20260820160621` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260820160621_journey_stage_overrides_phase2.sql` |
| `20260820174624` | `other` | `manual_data_review` | `manual_review` | Yes | No | No | `20260820174624_admin_dashboard_units_as_listings.sql` |
| `20260820192038` | `other` | `manual_data_review` | `manual_review` | Yes | No | No | `20260820192038_admin_dashboard_external_inventory_snapshots.sql` |
| `20260820192857` | `other` | `manual_data_review` | `manual_review` | Yes | No | No | `20260820192857_remove_admin_external_inventory_counts.sql` |
| `20260820193436` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260820193436_admin_dashboard_exact_active_listing_tokens.sql` |
| `202608230001` | `other` | `corrective_migration_required` | `corrective_required` | Yes | No | No | `202608230001_agency_onboarding_flow.sql` |
| `202608230002` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `202608230002_transaction_sale_profile_phase1.sql` |
| `202608240001` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `202608240001_prospect_demo_configs.sql` |
| `20260824084233` | `other` | `manual_data_review` | `manual_review` | Yes | No | No | `20260824084233_add_prospect_demo_brand_colours.sql` |
| `20260824091732` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260824091732_align_prospect_demo_admin_rls.sql` |
| `20260824092531` | `other` | `manual_data_review` | `manual_review` | Yes | No | No | `20260824092531_add_prospect_demo_light_dark_logos.sql` |
| `202608250001` | `other` | `manual_data_review` | `manual_review` | Yes | No | No | `202608250001_remove_listing_mandate_activation_guards.sql` |
| `20260827081713` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260827081713_normalize_transaction_participant_assignment_sources.sql` |
| `20260827083108` | `other` | `corrective_migration_required` | `corrective_required` | Yes | No | No | `20260827083108_normalize_transaction_participant_statuses.sql` |
| `20260827091439` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260827091439_transaction_setup_owner_rls_access.sql` |
| `202608290001` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202608290001_lead_multi_agent_assignments.sql` |
| `202608290002` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202608290002_client_compliance_verification.sql` |
| `20260829103738` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260829103738_transaction_sync_phase2_canonical_propagation.sql` |
| `20260829105514` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260829105514_transaction_sync_phase3_module_adapters.sql` |
| `20260829111644` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260829111644_transaction_sync_phase6_controlled_recovery.sql` |
| `20260829112135` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260829112135_transaction_sync_phase7_canary_certification.sql` |
| `20260829112530` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260829112530_transaction_sync_phase8_fleet_release_gate.sql` |
| `20260829195657` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260829195657_seller_onboarding_link_fast_prepare.sql` |
| `20260829204153` | `other` | `corrective_migration_required` | `corrective_required` | Yes | No | No | `20260829204153_seller_onboarding_completion_receipt_and_projection_rls.sql` |
| `20260830125035` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260830125035_attorney_dashboard_rpc_hot_path.sql` |
| `20260830160810` | `other` | `manual_data_review` | `manual_review` | Yes | No | No | `20260830160810_secure_auth_bootstrap_rpc.sql` |
| `20260831071807` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260831071807_canonical_transaction_requirements_on_creation.sql` |
| `20260831072652` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260831072652_canonical_transaction_requirements_on_creation.sql` |
| `20260831120000` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260831120000_property24_migration_listing_media_storage.sql` |
| `20260831131538` | `other` | `manual_data_review` | `manual_review` | Yes | No | No | `20260831131538_property24_canonical_connection_backfill.sql` |
| `20260831140736` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260831140736_property24_agent_catalog_mappings.sql` |
| `20260831150740` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260831150740_property24_live_cutover_gate.sql` |
| `20260831153322` | `other` | `manual_data_review` | `manual_review` | Yes | No | No | `20260831153322_staging_rls_warning_view_hardening.sql` |
| `20260831190341` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260831190341_compatibility_fallback_retirement_telemetry.sql` |
| `20260901075131` | `other` | `corrective_migration_required` | `corrective_required` | Yes | No | No | `20260901075131_public_development_landing_and_access_boundary.sql` |
| `20260901110612` | `other` | `corrective_migration_required` | `corrective_required` | Yes | No | No | `20260901110612_development_organisation_relationship_foundation.sql` |
| `20260901140943` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260901140943_harden_admin_portal_authorization.sql` |
| `20260901143358` | `other` | `manual_data_review` | `manual_review` | Yes | No | No | `20260901143358_property24_category_listing_facts.sql` |
| `20260901145225` | `other` | `manual_data_review` | `manual_review` | Yes | No | No | `20260901145225_property24_commercial_canonical_backfill.sql` |
| `20260901165511` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260901165511_website_publication_workflow_phase6.sql` |
| `20260901170254` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260901170254_development_structure_hierarchy_phase2.sql` |
| `20260901170909` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260901170909_development_product_catalogue_phase4.sql` |
| `20260901174924` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260901174924_website_draft_page_authoring_phase7.sql` |
| `20260902074000` | `other` | `manual_data_review` | `manual_review` | Yes | No | No | `20260902074000_hide_non_building_harbour_heights_map_markers.sql` |
| `20260902085300` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260902085300_allow_platform_admin_profile_role.sql` |
| `20260902095249` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260902095249_public_development_organisation_branding.sql` |
| `20260902105303` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260902105303_public_development_high_contrast_branding.sql` |
| `20260903094624` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260903094624_organisation_workspace_lock.sql` |
| `20260903122031` | `other` | `corrective_migration_required` | `corrective_required` | Yes | No | No | `20260903122031_development_marketing_collaboration_foundation.sql` |
| `20260903130012` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260903130012_development_marketing_invite_delivery_phase5.sql` |
| `20260905090353` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260905090353_document_trust_phase1_seller_atomic_link.sql` |
| `20260905091122` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260905091122_document_trust_phase3_role_scoped_projections.sql` |
| `20260905095152` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260905095152_document_trust_phase61_confirmed_remediation.sql` |
| `20260905120250` | `other` | `corrective_migration_required` | `corrective_required` | Yes | No | No | `20260905120250_rental_portal_foundation.sql` |
| `20260905125639` | `other` | `corrective_migration_required` | `corrective_required` | Yes | No | No | `20260905125639_rental_application_lead_linkage.sql` |
| `20260905141005` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260905141005_rental_property_foundation.sql` |
| `20260905141007` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260905141007_rental_unit_foundation.sql` |
| `20260905141008` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260905141008_rental_portfolio_foundation.sql` |
| `20260905141009` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260905141009_rental_landlord_mandate_foundation.sql` |
| `20260905141010` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260905141010_rental_vacancy_foundation.sql` |
| `20260905141011` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260905141011_rental_evidence_foundation.sql` |
| `20260905141012` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260905141012_rental_vacancy_marketing_foundation.sql` |
| `20260905141013` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260905141013_rental_internal_marketing_operations.sql` |
| `20260905141014` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260905141014_rental_applications_and_applicant_access.sql` |
| `20260905141015` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260905141015_rental_application_submission.sql` |
| `20260905141016` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260905141016_rental_application_documents.sql` |
| `20260905141017` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260905141017_rental_application_review_workspace.sql` |
| `20260905141018` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260905141018_rental_application_screening.sql` |
| `20260905141019` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260905141019_rental_application_screening_reviewer_actor.sql` |
| `20260905141020` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260905141020_rental_application_decisions.sql` |
| `20260905141021` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260905141021_rental_application_tenancy_conversion.sql` |
| `20260905150420` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260905150420_development_visual_analytics_phase14.sql` |
| `20260906063435` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260906063435_public_websites_phase7_privilege_hardening.sql` |
| `20260906065759` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260906065759_agent_phase2_rls_acceptance.sql` |
| `20260906070515` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260906070515_attorney_coordination_nomination_phase2.sql` |
| `20260906070938` | `other` | `corrective_migration_required` | `corrective_required` | Yes | No | No | `20260906070938_attorney_lane_delegation_phase3.sql` |
| `20260906071644` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260906071644_attorney_coordination_propagation_phase4.sql` |
| `20260906123000` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260906123000_public_websites_pilot_closeout_phase5_go_live.sql` |
| `20260906130000` | `other` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `20260906130000_meta_lead_ads_integration.sql` |
| `20260906133000` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260906133000_public_websites_pilot_closeout_phase6_hypercare.sql` |
| `20260906134500` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260906134500_public_websites_pilot_closeout_phase6_hypercare_indexes.sql` |
| `20260906140000` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `20260906140000_public_websites_pilot_closeout_phase6_approval_gate.sql` |

## Commands

| Version | Command |
| --- | --- |
| `20260828203724` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260828203724 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260828203724 --evidence docs/staging-evidence/20260828203724-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905100612` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260905100612 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905100612 --evidence docs/staging-evidence/20260905100612-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905100908` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260905100908 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905100908 --evidence docs/staging-evidence/20260905100908-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905101301` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260905101301 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905101301 --evidence docs/staging-evidence/20260905101301-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905101931` | `# Create an idempotent corrective migration first: supabase/migrations/TODO_20260905101931_corrective_bond_finance_runtime.sql`<br>`# Then rerun npm run supabase:phase5 and npm run supabase:push:phase2 before staging execution.` |
| `20260905102430` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260905102430 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905102430 --evidence docs/staging-evidence/20260905102430-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905102813` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260905102813 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905102813 --evidence docs/staging-evidence/20260905102813-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905102934` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260905102934 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905102934 --evidence docs/staging-evidence/20260905102934-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260903094957` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260903094957 --evidence docs/staging-evidence/20260903094957-attorney_identity_access.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260817174624` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260817174624 --evidence docs/staging-evidence/20260817174624-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260818203652` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260818203652 --evidence docs/staging-evidence/20260818203652-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202608200001` | `# Create an idempotent corrective migration first: supabase/migrations/TODO_202608200001_corrective_other.sql`<br>`# Then rerun npm run supabase:phase5 and npm run supabase:push:phase2 before staging execution.` |
| `202608200002` | `# Complete manual data review first: docs/manual-review/202608200002-other.md`<br>`# Decide whether this becomes an apply, repair-only, or replacement data migration.` |
| `20260820160621` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260820160621 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260820160621 --evidence docs/staging-evidence/20260820160621-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260820174624` | `# Complete manual data review first: docs/manual-review/20260820174624-other.md`<br>`# Decide whether this becomes an apply, repair-only, or replacement data migration.` |
| `20260820192038` | `# Complete manual data review first: docs/manual-review/20260820192038-other.md`<br>`# Decide whether this becomes an apply, repair-only, or replacement data migration.` |
| `20260820192857` | `# Complete manual data review first: docs/manual-review/20260820192857-other.md`<br>`# Decide whether this becomes an apply, repair-only, or replacement data migration.` |
| `20260820193436` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260820193436 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260820193436 --evidence docs/staging-evidence/20260820193436-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202608230001` | `# Create an idempotent corrective migration first: supabase/migrations/TODO_202608230001_corrective_other.sql`<br>`# Then rerun npm run supabase:phase5 and npm run supabase:push:phase2 before staging execution.` |
| `202608230002` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202608230002 --evidence docs/staging-evidence/202608230002-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202608240001` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202608240001 --evidence docs/staging-evidence/202608240001-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260824084233` | `# Complete manual data review first: docs/manual-review/20260824084233-other.md`<br>`# Decide whether this becomes an apply, repair-only, or replacement data migration.` |
| `20260824091732` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260824091732 --evidence docs/staging-evidence/20260824091732-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260824092531` | `# Complete manual data review first: docs/manual-review/20260824092531-other.md`<br>`# Decide whether this becomes an apply, repair-only, or replacement data migration.` |
| `202608250001` | `# Complete manual data review first: docs/manual-review/202608250001-other.md`<br>`# Decide whether this becomes an apply, repair-only, or replacement data migration.` |
| `20260827081713` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260827081713 --evidence docs/staging-evidence/20260827081713-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260827083108` | `# Create an idempotent corrective migration first: supabase/migrations/TODO_20260827083108_corrective_other.sql`<br>`# Then rerun npm run supabase:phase5 and npm run supabase:push:phase2 before staging execution.` |
| `20260827091439` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260827091439 --evidence docs/staging-evidence/20260827091439-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202608290001` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202608290001 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202608290001 --evidence docs/staging-evidence/202608290001-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `202608290002` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202608290002 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202608290002 --evidence docs/staging-evidence/202608290002-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260829103738` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260829103738 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260829103738 --evidence docs/staging-evidence/20260829103738-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260829105514` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260829105514 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260829105514 --evidence docs/staging-evidence/20260829105514-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260829111644` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260829111644 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260829111644 --evidence docs/staging-evidence/20260829111644-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260829112135` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260829112135 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260829112135 --evidence docs/staging-evidence/20260829112135-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260829112530` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260829112530 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260829112530 --evidence docs/staging-evidence/20260829112530-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260829195657` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260829195657 --evidence docs/staging-evidence/20260829195657-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260829204153` | `# Create an idempotent corrective migration first: supabase/migrations/TODO_20260829204153_corrective_other.sql`<br>`# Then rerun npm run supabase:phase5 and npm run supabase:push:phase2 before staging execution.` |
| `20260830125035` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260830125035 --evidence docs/staging-evidence/20260830125035-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260830160810` | `# Complete manual data review first: docs/manual-review/20260830160810-other.md`<br>`# Decide whether this becomes an apply, repair-only, or replacement data migration.` |
| `20260831071807` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260831071807 --evidence docs/staging-evidence/20260831071807-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260831072652` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260831072652 --evidence docs/staging-evidence/20260831072652-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260831120000` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260831120000 --evidence docs/staging-evidence/20260831120000-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260831131538` | `# Complete manual data review first: docs/manual-review/20260831131538-other.md`<br>`# Decide whether this becomes an apply, repair-only, or replacement data migration.` |
| `20260831140736` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260831140736 --evidence docs/staging-evidence/20260831140736-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260831150740` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260831150740 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260831150740 --evidence docs/staging-evidence/20260831150740-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260831153322` | `# Complete manual data review first: docs/manual-review/20260831153322-other.md`<br>`# Decide whether this becomes an apply, repair-only, or replacement data migration.` |
| `20260831190341` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260831190341 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260831190341 --evidence docs/staging-evidence/20260831190341-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260901075131` | `# Create an idempotent corrective migration first: supabase/migrations/TODO_20260901075131_corrective_other.sql`<br>`# Then rerun npm run supabase:phase5 and npm run supabase:push:phase2 before staging execution.` |
| `20260901110612` | `# Create an idempotent corrective migration first: supabase/migrations/TODO_20260901110612_corrective_other.sql`<br>`# Then rerun npm run supabase:phase5 and npm run supabase:push:phase2 before staging execution.` |
| `20260901140943` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260901140943 --evidence docs/staging-evidence/20260901140943-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260901143358` | `# Complete manual data review first: docs/manual-review/20260901143358-other.md`<br>`# Decide whether this becomes an apply, repair-only, or replacement data migration.` |
| `20260901145225` | `# Complete manual data review first: docs/manual-review/20260901145225-other.md`<br>`# Decide whether this becomes an apply, repair-only, or replacement data migration.` |
| `20260901165511` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260901165511 --evidence docs/staging-evidence/20260901165511-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260901170254` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260901170254 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260901170254 --evidence docs/staging-evidence/20260901170254-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260901170909` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260901170909 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260901170909 --evidence docs/staging-evidence/20260901170909-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260901174924` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260901174924 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260901174924 --evidence docs/staging-evidence/20260901174924-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260902074000` | `# Complete manual data review first: docs/manual-review/20260902074000-other.md`<br>`# Decide whether this becomes an apply, repair-only, or replacement data migration.` |
| `20260902085300` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260902085300 --evidence docs/staging-evidence/20260902085300-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260902095249` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260902095249 --evidence docs/staging-evidence/20260902095249-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260902105303` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260902105303 --evidence docs/staging-evidence/20260902105303-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260903094624` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260903094624 --evidence docs/staging-evidence/20260903094624-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260903122031` | `# Create an idempotent corrective migration first: supabase/migrations/TODO_20260903122031_corrective_other.sql`<br>`# Then rerun npm run supabase:phase5 and npm run supabase:push:phase2 before staging execution.` |
| `20260903130012` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260903130012 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260903130012 --evidence docs/staging-evidence/20260903130012-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905090353` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905090353 --evidence docs/staging-evidence/20260905090353-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905091122` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260905091122 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905091122 --evidence docs/staging-evidence/20260905091122-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905095152` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260905095152 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905095152 --evidence docs/staging-evidence/20260905095152-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905120250` | `# Create an idempotent corrective migration first: supabase/migrations/TODO_20260905120250_corrective_other.sql`<br>`# Then rerun npm run supabase:phase5 and npm run supabase:push:phase2 before staging execution.` |
| `20260905125639` | `# Create an idempotent corrective migration first: supabase/migrations/TODO_20260905125639_corrective_other.sql`<br>`# Then rerun npm run supabase:phase5 and npm run supabase:push:phase2 before staging execution.` |
| `20260905141005` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905141005 --evidence docs/staging-evidence/20260905141005-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905141007` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905141007 --evidence docs/staging-evidence/20260905141007-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905141008` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260905141008 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905141008 --evidence docs/staging-evidence/20260905141008-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905141009` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905141009 --evidence docs/staging-evidence/20260905141009-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905141010` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905141010 --evidence docs/staging-evidence/20260905141010-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905141011` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260905141011 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905141011 --evidence docs/staging-evidence/20260905141011-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905141012` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905141012 --evidence docs/staging-evidence/20260905141012-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905141013` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905141013 --evidence docs/staging-evidence/20260905141013-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905141014` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905141014 --evidence docs/staging-evidence/20260905141014-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905141015` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905141015 --evidence docs/staging-evidence/20260905141015-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905141016` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905141016 --evidence docs/staging-evidence/20260905141016-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905141017` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905141017 --evidence docs/staging-evidence/20260905141017-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905141018` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905141018 --evidence docs/staging-evidence/20260905141018-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905141019` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905141019 --evidence docs/staging-evidence/20260905141019-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905141020` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905141020 --evidence docs/staging-evidence/20260905141020-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905141021` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905141021 --evidence docs/staging-evidence/20260905141021-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260905150420` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260905150420 --evidence docs/staging-evidence/20260905150420-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260906063435` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260906063435 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260906063435 --evidence docs/staging-evidence/20260906063435-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260906065759` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260906065759 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260906065759 --evidence docs/staging-evidence/20260906065759-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260906070515` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260906070515 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260906070515 --evidence docs/staging-evidence/20260906070515-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260906070938` | `# Create an idempotent corrective migration first: supabase/migrations/TODO_20260906070938_corrective_other.sql`<br>`# Then rerun npm run supabase:phase5 and npm run supabase:push:phase2 before staging execution.` |
| `20260906071644` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260906071644 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260906071644 --evidence docs/staging-evidence/20260906071644-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260906123000` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260906123000 --evidence docs/staging-evidence/20260906123000-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260906130000` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 20260906130000 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260906130000 --evidence docs/staging-evidence/20260906130000-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260906133000` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260906133000 --evidence docs/staging-evidence/20260906133000-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260906134500` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260906134500 --evidence docs/staging-evidence/20260906134500-other.json --confirm APPLY_TO_STAGING_ONLY` |
| `20260906140000` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 20260906140000 --evidence docs/staging-evidence/20260906140000-other.json --confirm APPLY_TO_STAGING_ONLY` |

## Next Step

Phase 4 should prepare or collect reviewed staging evidence for the runner-eligible rows. Blocked rows need corrective migrations or manual data review before they can enter the runner path.
