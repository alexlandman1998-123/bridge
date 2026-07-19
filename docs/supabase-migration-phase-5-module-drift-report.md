# Supabase Migration Phase 5 Module Drift Report

Generated: 2026-07-18T22:03:40.698Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 5 is read-only. It classifies the remaining migration ledger drift by module and performs catalog-only object checks for local-only migrations. It does not run `db push`, `db reset`, `migration repair`, or any data-changing SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | MODULE_AUDIT_READY |
| Local migration files | 487 |
| Duplicate local timestamps | 0 |
| Remote ledger fetched | yes |
| Matched rows | 407 |
| Split local/remote versions | 17 |
| Reviewed split baseline | 17 |
| Unreviewed split versions | 0 |
| Pure local-only rows | 63 |
| Pure remote-only rows | 0 |
| Application manifest rows | 63 |
| Extracted objects checked | 489 |

## Module Summary

| Module | Pure Local-Only | Split Rows | Unreviewed Split | All Live | Partial Live | None Live | No Static Objects | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| other | 23 | 1 | 0 | 0 | 1 | 22 | 1 | Needs object-level review; do not repair as a batch yet. |
| canonical_documents | 19 | 0 | 0 | 0 | 0 | 19 | 0 | Needs object-level review; do not repair as a batch yet. |
| attorney | 14 | 0 | 0 | 1 | 3 | 10 | 0 | Needs object-level review; do not repair as a batch yet. |
| transaction_network | 5 | 1 | 0 | 1 | 0 | 5 | 0 | Needs object-level review; do not repair as a batch yet. |
| workspace_platform | 2 | 4 | 0 | 4 | 0 | 2 | 0 | Needs object-level review; do not repair as a batch yet. |
| commercial | 0 | 5 | 0 | 5 | 0 | 0 | 0 | No local-only work. |
| lead_capture_crm | 0 | 4 | 0 | 4 | 0 | 0 | 0 | No local-only work. |
| bond_finance | 0 | 1 | 0 | 0 | 0 | 0 | 1 | No local-only work. |
| notification_automation | 0 | 1 | 0 | 1 | 0 | 0 | 0 | No local-only work. |

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
| 202607180047 | attorney | 202607180047_attorney_calendar_phase4_rsvp_lifecycle.sql | 10/10 |

## Needs Object Review

| Version | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- |
| 202607170028 | attorney | 202607170028_settings_ownership_transfer_phase3_3.sql | none_live | 0/2 |
| 202607180026 | attorney | 202607180026_attorney_accounting_phase1_2_party_account_backfill.sql | none_live | 0/7 |
| 202607180027 | attorney | 202607180027_attorney_accounting_phase3_1_client_portal_accounts.sql | partial_live | 3/4 |
| 202607180028 | attorney | 202607180028_attorney_accounting_phase3_2_client_portal_proof_upload.sql | none_live | 0/1 |
| 202607180029 | attorney | 202607180029_attorney_accounting_phase3_3_proof_reconciliation_guard.sql | none_live | 0/1 |
| 202607180030 | attorney | 202607180030_attorney_accounting_phase3_4_portal_account_updates.sql | none_live | 0/1 |
| 202607180031 | attorney | 202607180031_attorney_accounting_phase5_payment_instructions.sql | none_live | 0/1 |
| 202607180036 | attorney | 202607180036_attorney_accounting_phase8_client_submission_checklist.sql | none_live | 0/1 |
| 202607180037 | attorney | 202607180037_attorney_professional_role_persistence_phase3.sql | partial_live | 4/27 |
| 202607180038 | attorney | 202607180038_attorney_signup_team_invitation_phase4.sql | none_live | 0/4 |
| 202607180040 | attorney | 202607180040_attorney_professional_permission_cutover_phase7.sql | partial_live | 3/4 |
| 202607180041 | attorney | 202607180041_attorney_role_integrity_gate_phase8.sql | none_live | 0/1 |
| 202607180042 | attorney | 202607180042_attorney_role_release_certification_phase9.sql | none_live | 0/5 |
| 202607170016 | canonical_documents | 202607170016_legal_document_counsel_approval_b3.sql | none_live | 0/1 |
| 202607170017 | canonical_documents | 202607170017_legal_document_review_cycle_restart_c3.sql | none_live | 0/1 |
| 202607170025 | canonical_documents | 202607170025_legal_packet_least_privilege_h2.sql | none_live | 0/5 |
| 202607180001 | canonical_documents | 202607180001_legal_document_runtime_without_approval_lock_a2.sql | none_live | 0/3 |
| 202607180002 | canonical_documents | 202607180002_canonical_document_lifecycle_persistence_a3.sql | none_live | 0/3 |
| 202607180003 | canonical_documents | 202607180003_canonical_editable_template_definition_b1.sql | none_live | 0/7 |
| 202607180005 | canonical_documents | 202607180005_immutable_template_revisioning_b4.sql | none_live | 0/9 |
| 202607180007 | canonical_documents | 202607180007_editable_document_revision_save_c2.sql | none_live | 0/1 |
| 202607180008 | canonical_documents | 202607180008_editable_document_autosave_restore_c3.sql | none_live | 0/1 |
| 202607180023 | canonical_documents | 202607180023_document_generator_launch_chain_g1.sql | none_live | 0/1 |
| 202607180033 | canonical_documents | 202607180033_document_generator_attempt_observability_i4.sql | none_live | 0/1 |
| 202607180034 | canonical_documents | 202607180034_document_generator_renderer_fence_i5.sql | none_live | 0/2 |
| 202607180035 | canonical_documents | 202607180035_attorney_accounting_phase7_document_requests.sql | none_live | 0/9 |
| 202607180043 | canonical_documents | 202607180043_document_experience_runtime_enforcement_n6.sql | none_live | 0/10 |
| 202607180048 | canonical_documents | 202607180048_document_generator_recovery_rehearsal_g4.sql | none_live | 0/1 |
| 202607180049 | canonical_documents | 202607180049_document_generator_least_privilege_h2.sql | none_live | 0/6 |
| 202607180050 | canonical_documents | 202607180050_document_generator_public_signer_surface_h4.sql | none_live | 0/1 |
| 202607180051 | canonical_documents | 202607180051_document_generator_concurrency_i1.sql | none_live | 0/6 |
| 202607180052 | canonical_documents | 202607180052_document_generator_backpressure_i3.sql | none_live | 0/3 |
| 202607170018 | other | 202607170018_legal_draft_review_gate_e1.sql | none_live | 0/2 |
| 202607170019 | other | 202607170019_legal_draft_immutable_lock_e2.sql | none_live | 0/6 |
| 202607170020 | other | 202607170020_legal_signing_envelope_assurance_e3.sql | none_live | 0/6 |
| 202607170021 | other | 202607170021_secure_legal_signing_dispatch_e4.sql | none_live | 0/3 |
| 202607170022 | other | 202607170022_legal_signer_session_integrity_f1.sql | none_live | 0/4 |
| 202607170023 | other | 202607170023_legal_final_signed_assurance_f2.sql | none_live | 0/8 |
| 202607170024 | other | 202607170024_legal_final_delivery_assurance_f3.sql | none_live | 0/10 |
| 202607170029 | other | 202607170029_legal_generation_concurrency_i1.sql | none_live | 0/2 |
| 202607170030 | other | 202607170030_legal_generation_backpressure_i3.sql | none_live | 0/6 |
| 202607170031 | other | 202607170031_legal_generation_support_triage_k2.sql | none_live | 0/2 |
| 202607180009 | other | 202607180009_editable_render_freeze_c4.sql | none_live | 0/4 |
| 202607180010 | other | 202607180010_deterministic_frozen_pdf_input_d1.sql | none_live | 0/1 |
| 202607180011 | other | 202607180011_server_attested_native_pdf_render_d2.sql | none_live | 0/1 |
| 202607180013 | other | 202607180013_certified_pdf_access_d4.sql | none_live | 0/1 |
| 202607180014 | other | 202607180014_signature_field_layout_foundation_e1.sql | none_live | 0/3 |
| 202607180015 | other | 202607180015_visual_pdf_field_placement_e2.sql | none_live | 0/1 |
| 202607180016 | other | 202607180016_apply_signing_layout_to_envelope_e3.sql | none_live | 0/1 |
| 202607180017 | other | 202607180017_applied_envelope_dispatch_e4.sql | none_live | 0/4 |
| 202607180018 | other | 202607180018_controlled_applied_envelope_signer_session_f1.sql | none_live | 0/2 |
| 202607180019 | other | 202607180019_controlled_final_signed_artifact_f2.sql | none_live | 0/4 |
| 202607180021 | other | 202607180021_cross_surface_completion_f4.sql | none_live | 0/5 |
| 202607180022 | other | 202607180022_final_completion_status_recovery_f5.sql | none_live | 0/6 |
| 202607180006 | transaction_network | 202607180006_editable_transaction_document_draft_c1.sql | none_live | 0/4 |
| 202607180012 | transaction_network | 202607180012_durable_transaction_pdf_link_d3.sql | none_live | 0/6 |
| 202607180020 | transaction_network | 202607180020_final_signed_transaction_publication_f3.sql | none_live | 0/7 |
| 202607180039 | transaction_network | 202607180039_attorney_assignment_qualification_phase6.sql | none_live | 0/3 |
| 202607180046 | transaction_network | 202607180046_mvp_atomic_transaction_creation_phase2a.sql | none_live | 0/6 |
| 202607170026 | workspace_platform | 202607170026_settings_job_title_governance_phase3_1.sql | none_live | 0/9 |
| 202607170027 | workspace_platform | 202607170027_settings_role_permission_governance_phase3_2.sql | none_live | 0/4 |

## Application Manifest

This is a conservative staging manifest, not authorization to apply SQL. `Depends On` expresses ordering within the inferred deployment stream; every stream still requires a live prerequisite check.

| Action | Count |
| --- | --- |
| apply_original_after_dependency_check | 58 |
| corrective_migration_required | 3 |
| manual_data_review | 1 |
| repair_only_after_smoke | 1 |

| Version | Stream | Depends On | Module | File | Evidence | Action | Required Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 202607170026 | settings_governance | stream preflight | workspace_platform | 202607170026_settings_job_title_governance_phase3_1.sql | none_live (0/9) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607170027 | settings_governance | 202607170026 | workspace_platform | 202607170027_settings_role_permission_governance_phase3_2.sql | none_live (0/4) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607170028 | settings_governance | 202607170027 | attorney | 202607170028_settings_ownership_transfer_phase3_3.sql | none_live (0/2) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607170016 | legal_review_assurance | stream preflight | canonical_documents | 202607170016_legal_document_counsel_approval_b3.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607170017 | legal_review_assurance | 202607170016 | canonical_documents | 202607170017_legal_document_review_cycle_restart_c3.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607170018 | legal_review_assurance | 202607170017 | other | 202607170018_legal_draft_review_gate_e1.sql | none_live (0/2) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607170019 | legal_review_assurance | 202607170018 | other | 202607170019_legal_draft_immutable_lock_e2.sql | none_live (0/6) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607170020 | legal_review_assurance | 202607170019 | other | 202607170020_legal_signing_envelope_assurance_e3.sql | none_live (0/6) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607170022 | legal_review_assurance | 202607170020 | other | 202607170022_legal_signer_session_integrity_f1.sql | none_live (0/4) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607170023 | legal_review_assurance | 202607170022 | other | 202607170023_legal_final_signed_assurance_f2.sql | none_live (0/8) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607170024 | legal_review_assurance | 202607170023 | other | 202607170024_legal_final_delivery_assurance_f3.sql | none_live (0/10) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607170021 | legal_document_runtime | stream preflight | other | 202607170021_secure_legal_signing_dispatch_e4.sql | none_live (0/3) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607170025 | legal_document_runtime | 202607170021 | canonical_documents | 202607170025_legal_packet_least_privilege_h2.sql | none_live (0/5) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180001 | legal_document_runtime | 202607170025 | canonical_documents | 202607180001_legal_document_runtime_without_approval_lock_a2.sql | none_live (0/3) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180002 | legal_document_runtime | 202607180001 | canonical_documents | 202607180002_canonical_document_lifecycle_persistence_a3.sql | none_live (0/3) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180003 | legal_document_runtime | 202607180002 | canonical_documents | 202607180003_canonical_editable_template_definition_b1.sql | none_live (0/7) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180004 | legal_document_runtime | 202607180003 | other | 202607180004_native_legal_starter_templates_b2.sql | no_static_objects | manual_data_review | Verify the intended data outcome and idempotency manually before deciding apply or repair. |
| 202607180005 | legal_document_runtime | 202607180004 | canonical_documents | 202607180005_immutable_template_revisioning_b4.sql | none_live (0/9) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180006 | legal_document_runtime | 202607180005 | transaction_network | 202607180006_editable_transaction_document_draft_c1.sql | none_live (0/4) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180007 | legal_document_runtime | 202607180006 | canonical_documents | 202607180007_editable_document_revision_save_c2.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180008 | legal_document_runtime | 202607180007 | canonical_documents | 202607180008_editable_document_autosave_restore_c3.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180009 | legal_document_runtime | 202607180008 | other | 202607180009_editable_render_freeze_c4.sql | none_live (0/4) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180010 | legal_document_runtime | 202607180009 | other | 202607180010_deterministic_frozen_pdf_input_d1.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180011 | legal_document_runtime | 202607180010 | other | 202607180011_server_attested_native_pdf_render_d2.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180012 | legal_document_runtime | 202607180011 | transaction_network | 202607180012_durable_transaction_pdf_link_d3.sql | none_live (0/6) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180013 | legal_document_runtime | 202607180012 | other | 202607180013_certified_pdf_access_d4.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180014 | legal_document_runtime | 202607180013 | other | 202607180014_signature_field_layout_foundation_e1.sql | none_live (0/3) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180015 | legal_document_runtime | 202607180014 | other | 202607180015_visual_pdf_field_placement_e2.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180016 | legal_document_runtime | 202607180015 | other | 202607180016_apply_signing_layout_to_envelope_e3.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180017 | legal_document_runtime | 202607180016 | other | 202607180017_applied_envelope_dispatch_e4.sql | none_live (0/4) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180018 | legal_document_runtime | 202607180017 | other | 202607180018_controlled_applied_envelope_signer_session_f1.sql | none_live (0/2) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180019 | legal_document_runtime | 202607180018 | other | 202607180019_controlled_final_signed_artifact_f2.sql | none_live (0/4) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180020 | legal_document_runtime | 202607180019 | transaction_network | 202607180020_final_signed_transaction_publication_f3.sql | none_live (0/7) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180021 | legal_document_runtime | 202607180020 | other | 202607180021_cross_surface_completion_f4.sql | none_live (0/5) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180022 | legal_document_runtime | 202607180021 | other | 202607180022_final_completion_status_recovery_f5.sql | none_live (0/6) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180043 | legal_document_runtime | 202607180022 | canonical_documents | 202607180043_document_experience_runtime_enforcement_n6.sql | none_live (0/10) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607170029 | document_generation | stream preflight | other | 202607170029_legal_generation_concurrency_i1.sql | none_live (0/2) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607170030 | document_generation | 202607170029 | other | 202607170030_legal_generation_backpressure_i3.sql | none_live (0/6) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607170031 | document_generation | 202607170030 | other | 202607170031_legal_generation_support_triage_k2.sql | none_live (0/2) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180023 | document_generation | 202607170031 | canonical_documents | 202607180023_document_generator_launch_chain_g1.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180033 | document_generation | 202607180023 | canonical_documents | 202607180033_document_generator_attempt_observability_i4.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180034 | document_generation | 202607180033 | canonical_documents | 202607180034_document_generator_renderer_fence_i5.sql | none_live (0/2) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180048 | document_generation | 202607180034 | canonical_documents | 202607180048_document_generator_recovery_rehearsal_g4.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180049 | document_generation | 202607180048 | canonical_documents | 202607180049_document_generator_least_privilege_h2.sql | none_live (0/6) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180050 | document_generation | 202607180049 | canonical_documents | 202607180050_document_generator_public_signer_surface_h4.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180051 | document_generation | 202607180050 | canonical_documents | 202607180051_document_generator_concurrency_i1.sql | none_live (0/6) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180052 | document_generation | 202607180051 | canonical_documents | 202607180052_document_generator_backpressure_i3.sql | none_live (0/3) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180026 | attorney_accounting | stream preflight | attorney | 202607180026_attorney_accounting_phase1_2_party_account_backfill.sql | none_live (0/7) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180027 | attorney_accounting | 202607180026 | attorney | 202607180027_attorney_accounting_phase3_1_client_portal_accounts.sql | partial_live (3/4) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 202607180028 | attorney_accounting | 202607180027 | attorney | 202607180028_attorney_accounting_phase3_2_client_portal_proof_upload.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180029 | attorney_accounting | 202607180028 | attorney | 202607180029_attorney_accounting_phase3_3_proof_reconciliation_guard.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180030 | attorney_accounting | 202607180029 | attorney | 202607180030_attorney_accounting_phase3_4_portal_account_updates.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180031 | attorney_accounting | 202607180030 | attorney | 202607180031_attorney_accounting_phase5_payment_instructions.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180035 | attorney_accounting | 202607180031 | canonical_documents | 202607180035_attorney_accounting_phase7_document_requests.sql | none_live (0/9) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180036 | attorney_accounting | 202607180035 | attorney | 202607180036_attorney_accounting_phase8_client_submission_checklist.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180047 | attorney_calendar | stream preflight | attorney | 202607180047_attorney_calendar_phase4_rsvp_lifecycle.sql | all_live (10/10) | repair_only_after_smoke | Run module behavior tests; then record only this version as applied. |
| 202607180037 | attorney_identity_access | stream preflight | attorney | 202607180037_attorney_professional_role_persistence_phase3.sql | partial_live (4/27) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 202607180038 | attorney_identity_access | 202607180037 | attorney | 202607180038_attorney_signup_team_invitation_phase4.sql | none_live (0/4) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180039 | attorney_identity_access | 202607180038 | transaction_network | 202607180039_attorney_assignment_qualification_phase6.sql | none_live (0/3) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180040 | attorney_identity_access | 202607180039 | attorney | 202607180040_attorney_professional_permission_cutover_phase7.sql | partial_live (3/4) | corrective_migration_required | Diff live definitions, create an idempotent corrective migration, and verify both outcomes. |
| 202607180041 | attorney_identity_access | 202607180040 | attorney | 202607180041_attorney_role_integrity_gate_phase8.sql | none_live (0/1) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180042 | attorney_identity_access | 202607180041 | attorney | 202607180042_attorney_role_release_certification_phase9.sql | none_live (0/5) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |
| 202607180046 | transaction_creation | stream preflight | transaction_network | 202607180046_mvp_atomic_transaction_creation_phase2a.sql | none_live (0/6) | apply_original_after_dependency_check | Prove prerequisites in staging, apply this file alone, and run catalog plus behavior checks. |

## Local-Only Drift Detail

| Version | Bucket | Module | File | Object Status | Objects Live |
| --- | --- | --- | --- | --- | --- |
| 202607170028 | pure_local_only | attorney | 202607170028_settings_ownership_transfer_phase3_3.sql | none_live | 0/2 |
| 202607180026 | pure_local_only | attorney | 202607180026_attorney_accounting_phase1_2_party_account_backfill.sql | none_live | 0/7 |
| 202607180027 | pure_local_only | attorney | 202607180027_attorney_accounting_phase3_1_client_portal_accounts.sql | partial_live | 3/4 |
| 202607180028 | pure_local_only | attorney | 202607180028_attorney_accounting_phase3_2_client_portal_proof_upload.sql | none_live | 0/1 |
| 202607180029 | pure_local_only | attorney | 202607180029_attorney_accounting_phase3_3_proof_reconciliation_guard.sql | none_live | 0/1 |
| 202607180030 | pure_local_only | attorney | 202607180030_attorney_accounting_phase3_4_portal_account_updates.sql | none_live | 0/1 |
| 202607180031 | pure_local_only | attorney | 202607180031_attorney_accounting_phase5_payment_instructions.sql | none_live | 0/1 |
| 202607180036 | pure_local_only | attorney | 202607180036_attorney_accounting_phase8_client_submission_checklist.sql | none_live | 0/1 |
| 202607180037 | pure_local_only | attorney | 202607180037_attorney_professional_role_persistence_phase3.sql | partial_live | 4/27 |
| 202607180038 | pure_local_only | attorney | 202607180038_attorney_signup_team_invitation_phase4.sql | none_live | 0/4 |
| 202607180040 | pure_local_only | attorney | 202607180040_attorney_professional_permission_cutover_phase7.sql | partial_live | 3/4 |
| 202607180041 | pure_local_only | attorney | 202607180041_attorney_role_integrity_gate_phase8.sql | none_live | 0/1 |
| 202607180042 | pure_local_only | attorney | 202607180042_attorney_role_release_certification_phase9.sql | none_live | 0/5 |
| 202607180047 | pure_local_only | attorney | 202607180047_attorney_calendar_phase4_rsvp_lifecycle.sql | all_live | 10/10 |
| 202606050001 | split_local_remote | bond_finance | 202606050001_bond_bank_relationship_profiles.sql | no_static_objects | n/a |
| 202607170016 | pure_local_only | canonical_documents | 202607170016_legal_document_counsel_approval_b3.sql | none_live | 0/1 |
| 202607170017 | pure_local_only | canonical_documents | 202607170017_legal_document_review_cycle_restart_c3.sql | none_live | 0/1 |
| 202607170025 | pure_local_only | canonical_documents | 202607170025_legal_packet_least_privilege_h2.sql | none_live | 0/5 |
| 202607180001 | pure_local_only | canonical_documents | 202607180001_legal_document_runtime_without_approval_lock_a2.sql | none_live | 0/3 |
| 202607180002 | pure_local_only | canonical_documents | 202607180002_canonical_document_lifecycle_persistence_a3.sql | none_live | 0/3 |
| 202607180003 | pure_local_only | canonical_documents | 202607180003_canonical_editable_template_definition_b1.sql | none_live | 0/7 |
| 202607180005 | pure_local_only | canonical_documents | 202607180005_immutable_template_revisioning_b4.sql | none_live | 0/9 |
| 202607180007 | pure_local_only | canonical_documents | 202607180007_editable_document_revision_save_c2.sql | none_live | 0/1 |
| 202607180008 | pure_local_only | canonical_documents | 202607180008_editable_document_autosave_restore_c3.sql | none_live | 0/1 |
| 202607180023 | pure_local_only | canonical_documents | 202607180023_document_generator_launch_chain_g1.sql | none_live | 0/1 |
| 202607180033 | pure_local_only | canonical_documents | 202607180033_document_generator_attempt_observability_i4.sql | none_live | 0/1 |
| 202607180034 | pure_local_only | canonical_documents | 202607180034_document_generator_renderer_fence_i5.sql | none_live | 0/2 |
| 202607180035 | pure_local_only | canonical_documents | 202607180035_attorney_accounting_phase7_document_requests.sql | none_live | 0/9 |
| 202607180043 | pure_local_only | canonical_documents | 202607180043_document_experience_runtime_enforcement_n6.sql | none_live | 0/10 |
| 202607180048 | pure_local_only | canonical_documents | 202607180048_document_generator_recovery_rehearsal_g4.sql | none_live | 0/1 |
| 202607180049 | pure_local_only | canonical_documents | 202607180049_document_generator_least_privilege_h2.sql | none_live | 0/6 |
| 202607180050 | pure_local_only | canonical_documents | 202607180050_document_generator_public_signer_surface_h4.sql | none_live | 0/1 |
| 202607180051 | pure_local_only | canonical_documents | 202607180051_document_generator_concurrency_i1.sql | none_live | 0/6 |
| 202607180052 | pure_local_only | canonical_documents | 202607180052_document_generator_backpressure_i3.sql | none_live | 0/3 |
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
| 202607170018 | pure_local_only | other | 202607170018_legal_draft_review_gate_e1.sql | none_live | 0/2 |
| 202607170019 | pure_local_only | other | 202607170019_legal_draft_immutable_lock_e2.sql | none_live | 0/6 |
| 202607170020 | pure_local_only | other | 202607170020_legal_signing_envelope_assurance_e3.sql | none_live | 0/6 |
| 202607170021 | pure_local_only | other | 202607170021_secure_legal_signing_dispatch_e4.sql | none_live | 0/3 |
| 202607170022 | pure_local_only | other | 202607170022_legal_signer_session_integrity_f1.sql | none_live | 0/4 |
| 202607170023 | pure_local_only | other | 202607170023_legal_final_signed_assurance_f2.sql | none_live | 0/8 |
| 202607170024 | pure_local_only | other | 202607170024_legal_final_delivery_assurance_f3.sql | none_live | 0/10 |
| 202607170029 | pure_local_only | other | 202607170029_legal_generation_concurrency_i1.sql | none_live | 0/2 |
| 202607170030 | pure_local_only | other | 202607170030_legal_generation_backpressure_i3.sql | none_live | 0/6 |
| 202607170031 | pure_local_only | other | 202607170031_legal_generation_support_triage_k2.sql | none_live | 0/2 |
| 202607180004 | pure_local_only | other | 202607180004_native_legal_starter_templates_b2.sql | no_static_objects | n/a |
| 202607180009 | pure_local_only | other | 202607180009_editable_render_freeze_c4.sql | none_live | 0/4 |
| 202607180010 | pure_local_only | other | 202607180010_deterministic_frozen_pdf_input_d1.sql | none_live | 0/1 |
| 202607180011 | pure_local_only | other | 202607180011_server_attested_native_pdf_render_d2.sql | none_live | 0/1 |
| 202607180013 | pure_local_only | other | 202607180013_certified_pdf_access_d4.sql | none_live | 0/1 |
| 202607180014 | pure_local_only | other | 202607180014_signature_field_layout_foundation_e1.sql | none_live | 0/3 |
| 202607180015 | pure_local_only | other | 202607180015_visual_pdf_field_placement_e2.sql | none_live | 0/1 |
| 202607180016 | pure_local_only | other | 202607180016_apply_signing_layout_to_envelope_e3.sql | none_live | 0/1 |
| 202607180017 | pure_local_only | other | 202607180017_applied_envelope_dispatch_e4.sql | none_live | 0/4 |
| 202607180018 | pure_local_only | other | 202607180018_controlled_applied_envelope_signer_session_f1.sql | none_live | 0/2 |
| 202607180019 | pure_local_only | other | 202607180019_controlled_final_signed_artifact_f2.sql | none_live | 0/4 |
| 202607180021 | pure_local_only | other | 202607180021_cross_surface_completion_f4.sql | none_live | 0/5 |
| 202607180022 | pure_local_only | other | 202607180022_final_completion_status_recovery_f5.sql | none_live | 0/6 |
| 202606010001 | split_local_remote | transaction_network | 202606010001_partner_routing_rules_phase1.sql | all_live | 15/15 |
| 202607180006 | pure_local_only | transaction_network | 202607180006_editable_transaction_document_draft_c1.sql | none_live | 0/4 |
| 202607180012 | pure_local_only | transaction_network | 202607180012_durable_transaction_pdf_link_d3.sql | none_live | 0/6 |
| 202607180020 | pure_local_only | transaction_network | 202607180020_final_signed_transaction_publication_f3.sql | none_live | 0/7 |
| 202607180039 | pure_local_only | transaction_network | 202607180039_attorney_assignment_qualification_phase6.sql | none_live | 0/3 |
| 202607180046 | pure_local_only | transaction_network | 202607180046_mvp_atomic_transaction_creation_phase2a.sql | none_live | 0/6 |
| 202606040001 | split_local_remote | workspace_platform | 202606040001_onboarding_role_contract_phase2.sql | all_live | 8/8 |
| 202606040002 | split_local_remote | workspace_platform | 202606040002_workspace_entitlements_phase4.sql | all_live | 11/11 |
| 202606040004 | split_local_remote | workspace_platform | 202606040004_workspace_entitlement_enforcement_phase5.sql | all_live | 15/15 |
| 202606040005 | split_local_remote | workspace_platform | 202606040005_workspace_billing_operations_phase6.sql | all_live | 12/12 |
| 202607170026 | pure_local_only | workspace_platform | 202607170026_settings_job_title_governance_phase3_1.sql | none_live | 0/9 |
| 202607170027 | pure_local_only | workspace_platform | 202607170027_settings_role_permission_governance_phase3_2.sql | none_live | 0/4 |

## Object Extraction

| Metric | Value |
| --- | --- |
| Static objects extracted | 489 |
| Catalog rows returned | 489 |
| Object check command | ok |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase5-object-checks-83392.sql --output-format json | ok | Initialising login role... |

## Next Step

Use this module matrix to choose the next small repair batch. Any unreviewed split ledger row must be investigated first; reviewed baseline rows remain excluded from repair batches. Pure local-only rows need module smoke evidence before any `migration repair`.

