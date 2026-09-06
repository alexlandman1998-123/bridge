# Supabase Phase 8 Closeout Report

Generated: 2026-09-06T16:56:34.691Z
Production project: `isdowlnollckzvltkasn`

## Decision

**Status: CLOSEOUT_BLOCKED**

The Phase 0 broad-push freeze remains active unless this report says `READY_FOR_REVIEWED_PHASE0_FREEZE_RETIREMENT`. Even a ready report authorizes a reviewed guard-removal change; it does not remove the guard automatically.

## Gate Summary

| Check | Result |
| --- | --- |
| Local migration files | 1000 |
| Phase 5 manifest rows | 93 |
| Duplicate versions | 0 |
| Missing manifest files | 0 |
| Complete production evidence rows | 4 |
| Incomplete production evidence rows | 89 |
| Production recovery evidence locked | Yes |
| Production recovery evidence blockers | 0 |
| Unknown evidence rows | 0 |
| Duplicate evidence versions | 0 |
| Ledger drift resolution loaded | Yes |
| Ledger drift resolution status | LEDGER_DRIFT_BLOCKED |
| Ledger drift resolution blockers | 156 |
| Live verification performed | Yes |
| Pure local-only versions | 89 |
| Pure remote-only versions | 0 |
| Divergent versions | 0 |
| Unreviewed split versions | 0 |
| Production PITR | Disabled |
| Physical backups | 8 |
| Ready for reviewed freeze retirement | No |

## Incomplete Evidence Versions

- `20260906163535`
- `20260905102430`
- `20260905102813`
- `20260905102934`
- `20260903094957`
- `20260817174624`
- `20260818203652`
- `20260906163540`
- `202608200002`
- `20260820160621`
- `20260820174624`
- `20260820192038`
- `20260820192857`
- `20260820193436`
- `20260906163545`
- `202608230002`
- `202608240001`
- `20260824084233`
- `20260824091732`
- `20260824092531`
- `202608250001`
- `20260827081713`
- `20260906163551`
- `20260827091439`
- `202608290001`
- `202608290002`
- `20260829103738`
- `20260829105514`
- `20260829111644`
- `20260829112135`
- `20260829112530`
- `20260829195657`
- `20260906163555`
- `20260830125035`
- `20260830160810`
- `20260831071807`
- `20260831072652`
- `20260831120000`
- `20260831131538`
- `20260831140736`
- `20260831150740`
- `20260831153322`
- `20260831190341`
- `20260906163601`
- `20260906163615`
- `20260901140943`
- `20260901143358`
- `20260901145225`
- `20260901165511`
- `20260901170254`
- `20260901170909`
- `20260901174924`
- `20260902095249`
- `20260902105303`
- `20260903094624`
- `20260906163622`
- `20260903130012`
- `20260905090353`
- `20260905091122`
- `20260905095152`
- `20260906163617`
- `20260906163629`
- `20260905141005`
- `20260905141007`
- `20260905141008`
- `20260905141009`
- `20260905141010`
- `20260905141011`
- `20260905141012`
- `20260905141013`
- `20260905141014`
- `20260905141015`
- `20260905141016`
- `20260905141017`
- `20260905141018`
- `20260905141019`
- `20260905141020`
- `20260905141021`
- `20260905150420`
- `20260906063435`
- `20260906065759`
- `20260906070515`
- `20260906163638`
- `20260906071644`
- `20260906123000`
- `20260906130000`
- `20260906133000`
- `20260906134500`
- `20260906140000`

## Recovery Evidence Blockers

- None

## Evidence By Stream

| Stream | Rows | Complete Evidence | Incomplete Evidence | Actions |
| --- | --- | --- | --- | --- |
| `bond_finance_runtime` | 8 | 4 | 4 | `apply_original_after_dependency_check` |
| `attorney_identity_access` | 1 | 0 | 1 | `repair_only_after_smoke` |
| `other` | 84 | 0 | 84 | `apply_original_after_dependency_check`<br>`repair_only_after_smoke` |

## Closeout Work Queue

| Version | Stream | Evidence | Action | Object Status | File |
| --- | --- | --- | --- | --- | --- |
| `20260906163535` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260906163535_corrective_bond_delivery_reminders.sql` |
| `20260905102430` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260905102430_bond_application_portal_phase6_document_continuity.sql` |
| `20260905102813` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260905102813_bond_application_portal_phase7_submission_readiness.sql` |
| `20260905102934` | `bond_finance_runtime` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260905102934_bond_application_portal_phase8_external_submission_record.sql` |
| `20260903094957` | `attorney_identity_access` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260903094957_retire_inactive_attorney_assignments.sql` |
| `20260817174624` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260817174624_arch9_inbound_leads_flow.sql` |
| `20260818203652` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260818203652_arch9_inbound_leads_snapshot_profile_shape.sql` |
| `20260906163540` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260906163540_corrective_whatsapp_foundation.sql` |
| `202608200002` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202608200002_whatsapp_template_seed.sql` |
| `20260820160621` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260820160621_journey_stage_overrides_phase2.sql` |
| `20260820174624` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260820174624_admin_dashboard_units_as_listings.sql` |
| `20260820192038` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260820192038_admin_dashboard_external_inventory_snapshots.sql` |
| `20260820192857` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260820192857_remove_admin_external_inventory_counts.sql` |
| `20260820193436` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260820193436_admin_dashboard_exact_active_listing_tokens.sql` |
| `20260906163545` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260906163545_corrective_agency_onboarding.sql` |
| `202608230002` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `202608230002_transaction_sale_profile_phase1.sql` |
| `202608240001` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `202608240001_prospect_demo_configs.sql` |
| `20260824084233` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260824084233_add_prospect_demo_brand_colours.sql` |
| `20260824091732` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260824091732_align_prospect_demo_admin_rls.sql` |
| `20260824092531` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260824092531_add_prospect_demo_light_dark_logos.sql` |
| `202608250001` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202608250001_remove_listing_mandate_activation_guards.sql` |
| `20260827081713` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260827081713_normalize_transaction_participant_assignment_sources.sql` |
| `20260906163551` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260906163551_corrective_transaction_participant_statuses.sql` |
| `20260827091439` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260827091439_transaction_setup_owner_rls_access.sql` |
| `202608290001` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202608290001_lead_multi_agent_assignments.sql` |
| `202608290002` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `202608290002_client_compliance_verification.sql` |
| `20260829103738` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260829103738_transaction_sync_phase2_canonical_propagation.sql` |
| `20260829105514` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260829105514_transaction_sync_phase3_module_adapters.sql` |
| `20260829111644` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260829111644_transaction_sync_phase6_controlled_recovery.sql` |
| `20260829112135` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260829112135_transaction_sync_phase7_canary_certification.sql` |
| `20260829112530` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260829112530_transaction_sync_phase8_fleet_release_gate.sql` |
| `20260829195657` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260829195657_seller_onboarding_link_fast_prepare.sql` |
| `20260906163555` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260906163555_corrective_seller_onboarding_receipt.sql` |
| `20260830125035` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260830125035_attorney_dashboard_rpc_hot_path.sql` |
| `20260830160810` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260830160810_secure_auth_bootstrap_rpc.sql` |
| `20260831071807` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260831071807_canonical_transaction_requirements_on_creation.sql` |
| `20260831072652` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260831072652_canonical_transaction_requirements_on_creation.sql` |
| `20260831120000` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260831120000_property24_migration_listing_media_storage.sql` |
| `20260831131538` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260831131538_property24_canonical_connection_backfill.sql` |
| `20260831140736` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260831140736_property24_agent_catalog_mappings.sql` |
| `20260831150740` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260831150740_property24_live_cutover_gate.sql` |
| `20260831153322` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260831153322_staging_rls_warning_view_hardening.sql` |
| `20260831190341` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260831190341_compatibility_fallback_retirement_telemetry.sql` |
| `20260906163601` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260906163601_corrective_development_access_boundary.sql` |
| `20260906163615` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260906163615_corrective_development_org_relationships.sql` |
| `20260901140943` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260901140943_harden_admin_portal_authorization.sql` |
| `20260901143358` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260901143358_property24_category_listing_facts.sql` |
| `20260901145225` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260901145225_property24_commercial_canonical_backfill.sql` |
| `20260901165511` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260901165511_website_publication_workflow_phase6.sql` |
| `20260901170254` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260901170254_development_structure_hierarchy_phase2.sql` |
| `20260901170909` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260901170909_development_product_catalogue_phase4.sql` |
| `20260901174924` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260901174924_website_draft_page_authoring_phase7.sql` |
| `20260902095249` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260902095249_public_development_organisation_branding.sql` |
| `20260902105303` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260902105303_public_development_high_contrast_branding.sql` |
| `20260903094624` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260903094624_organisation_workspace_lock.sql` |
| `20260906163622` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260906163622_corrective_development_marketing_collaboration.sql` |
| `20260903130012` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260903130012_development_marketing_invite_delivery_phase5.sql` |
| `20260905090353` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260905090353_document_trust_phase1_seller_atomic_link.sql` |
| `20260905091122` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260905091122_document_trust_phase3_role_scoped_projections.sql` |
| `20260905095152` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260905095152_document_trust_phase61_confirmed_remediation.sql` |
| `20260906163617` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260906163617_corrective_rental_portal_foundation.sql` |
| `20260906163629` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260906163629_corrective_rental_application_lead_linkage.sql` |
| `20260905141005` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260905141005_rental_property_foundation.sql` |
| `20260905141007` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260905141007_rental_unit_foundation.sql` |
| `20260905141008` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260905141008_rental_portfolio_foundation.sql` |
| `20260905141009` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260905141009_rental_landlord_mandate_foundation.sql` |
| `20260905141010` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260905141010_rental_vacancy_foundation.sql` |
| `20260905141011` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260905141011_rental_evidence_foundation.sql` |
| `20260905141012` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260905141012_rental_vacancy_marketing_foundation.sql` |
| `20260905141013` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260905141013_rental_internal_marketing_operations.sql` |
| `20260905141014` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260905141014_rental_applications_and_applicant_access.sql` |
| `20260905141015` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260905141015_rental_application_submission.sql` |
| `20260905141016` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260905141016_rental_application_documents.sql` |
| `20260905141017` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260905141017_rental_application_review_workspace.sql` |
| `20260905141018` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260905141018_rental_application_screening.sql` |
| `20260905141019` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260905141019_rental_application_screening_reviewer_actor.sql` |
| `20260905141020` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260905141020_rental_application_decisions.sql` |
| `20260905141021` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260905141021_rental_application_tenancy_conversion.sql` |
| `20260905150420` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260905150420_development_visual_analytics_phase14.sql` |
| `20260906063435` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260906063435_public_websites_phase7_privilege_hardening.sql` |
| `20260906065759` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260906065759_agent_phase2_rls_acceptance.sql` |
| `20260906070515` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260906070515_attorney_coordination_nomination_phase2.sql` |
| `20260906163638` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260906163638_corrective_attorney_lane_delegation.sql` |
| `20260906071644` | `other` | `incomplete` | `apply_original_after_dependency_check` | `n/a` | `20260906071644_attorney_coordination_propagation_phase4.sql` |
| `20260906123000` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260906123000_public_websites_pilot_closeout_phase5_go_live.sql` |
| `20260906130000` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260906130000_meta_lead_ads_integration.sql` |
| `20260906133000` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260906133000_public_websites_pilot_closeout_phase6_hypercare.sql` |
| `20260906134500` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260906134500_public_websites_pilot_closeout_phase6_hypercare_indexes.sql` |
| `20260906140000` | `other` | `incomplete` | `repair_only_after_smoke` | `n/a` | `20260906140000_public_websites_pilot_closeout_phase6_approval_gate.sql` |

## Closeout Rule

Do not remove `scripts/supabase-phase0-guard.mjs`, its CI enforcement, or the broad-push freeze until all local and live checks pass, all 93 manifest versions have reviewed closeout evidence, and production recovery is available and tested.
