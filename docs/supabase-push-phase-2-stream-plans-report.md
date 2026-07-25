# Supabase Push Phase 2 Stream Plans Report

Generated: 2026-07-25T17:17:27.300Z

## Scope

Phase 2 runs every staging stream plan from the current manifest. It is read-only and does not apply SQL, record ledger rows, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Manifest rows | 25 |
| Planned rows | 25 |
| Streams | 6 |

## Streams

| Stream | Rows | Actions |
| --- | --- | --- |
| `legal_document_runtime` | 18 | `repair_only_after_smoke`: 2<br>`apply_original_after_dependency_check`: 16 |
| `seller_transaction_continuity` | 1 | `apply_original_after_dependency_check`: 1 |
| `bond_finance_runtime` | 2 | `apply_original_after_dependency_check`: 2 |
| `attorney_workflow_runtime` | 1 | `repair_only_after_smoke`: 1 |
| `workspace_profile_management` | 1 | `apply_original_after_dependency_check`: 1 |
| `other` | 2 | `repair_only_after_smoke`: 1<br>`apply_original_after_dependency_check`: 1 |

## Work Queue

| Version | Stream | Depends On | Action | Object Status | File |
| --- | --- | --- | --- | --- | --- |
| `202607220001` | `legal_document_runtime` | `stream preflight` | `repair_only_after_smoke` | `all_live` | `202607220001_document_workspace_status_phase2.sql` |
| `202607220002` | `legal_document_runtime` | `202607220001` | `apply_original_after_dependency_check` | `none_live` | `202607220002_authoritative_mandate_signing_delivery_phase0.sql` |
| `202607220003` | `legal_document_runtime` | `202607220002` | `apply_original_after_dependency_check` | `none_live` | `202607220003_signable_packet_sent_phase1.sql` |
| `202607250002` | `legal_document_runtime` | `202607220003` | `apply_original_after_dependency_check` | `partial_live` | `202607250002_corrective_canonical_otp_signing_phase2.sql` |
| `202607220005` | `legal_document_runtime` | `202607220004` | `apply_original_after_dependency_check` | `none_live` | `202607220005_canonical_otp_seal_atomic_recovery.sql` |
| `202607250003` | `legal_document_runtime` | `202607220005` | `apply_original_after_dependency_check` | `partial_live` | `202607250003_corrective_visual_signature_evidence.sql` |
| `202607250004` | `legal_document_runtime` | `202607220006` | `apply_original_after_dependency_check` | `partial_live` | `202607250004_corrective_legal_runtime_metadata_immutability.sql` |
| `202607220008` | `legal_document_runtime` | `202607220007` | `apply_original_after_dependency_check` | `none_live` | `202607220008_phase4_legal_template_release_integrity.sql` |
| `202607220009` | `legal_document_runtime` | `202607220008` | `apply_original_after_dependency_check` | `none_live` | `202607220009_phase4_legal_release_provenance.sql` |
| `202607220010` | `legal_document_runtime` | `202607220009` | `repair_only_after_smoke` | `all_live` | `202607220010_phase4_seller_portal_final_artifact_fence.sql` |
| `202607220011` | `legal_document_runtime` | `202607220010` | `apply_original_after_dependency_check` | `none_live` | `202607220011_phase4_legal_release_persistence_fence.sql` |
| `202607220012` | `legal_document_runtime` | `202607220011` | `apply_original_after_dependency_check` | `none_live` | `202607220012_phase5_legal_document_health_incident_integrity.sql` |
| `202607230004` | `legal_document_runtime` | `202607220012` | `apply_original_after_dependency_check` | `none_live` | `202607230004_phase5_pilot_release_trace_integrity.sql` |
| `202607230005` | `legal_document_runtime` | `202607230004` | `apply_original_after_dependency_check` | `none_live` | `202607230005_phase6_successor_release_epoch_integrity.sql` |
| `202607240002` | `legal_document_runtime` | `202607230005` | `apply_original_after_dependency_check` | `no_static_objects` | `202607240002_global_mandate_platform_default_phase2.sql` |
| `202607250002` | `legal_document_runtime` | `202607240002` | `apply_original_after_dependency_check` | `partial_live` | `202607250002_corrective_canonical_otp_signing_phase2.sql` |
| `202607250003` | `legal_document_runtime` | `202607250002` | `apply_original_after_dependency_check` | `partial_live` | `202607250003_corrective_visual_signature_evidence.sql` |
| `202607250004` | `legal_document_runtime` | `202607250003` | `apply_original_after_dependency_check` | `partial_live` | `202607250004_corrective_legal_runtime_metadata_immutability.sql` |
| `202607250005` | `seller_transaction_continuity` | `stream preflight` | `apply_original_after_dependency_check` | `partial_live` | `202607250005_corrective_seller_document_transaction_continuity.sql` |
| `202607220013` | `bond_finance_runtime` | `stream preflight` | `apply_original_after_dependency_check` | `none_live` | `202607220013_bond_application_consent_and_finance_document_audit.sql` |
| `202607220014` | `bond_finance_runtime` | `202607220013` | `apply_original_after_dependency_check` | `none_live` | `202607220014_bond_partner_referral_terms_and_ledger.sql` |
| `202607230013` | `attorney_workflow_runtime` | `stream preflight` | `repair_only_after_smoke` | `all_live` | `202607230013_attorney_workflow_step_completion_advance.sql` |
| `202607240001` | `workspace_profile_management` | `stream preflight` | `apply_original_after_dependency_check` | `none_live` | `202607240001_agent_profile_management_rpc.sql` |
| `202607250001` | `other` | `stream preflight` | `repair_only_after_smoke` | `all_live` | `202607250001_seller_portal_payload_optional_enrichment_guard.sql` |
| `202607250005` | `other` | `202607250001` | `apply_original_after_dependency_check` | `partial_live` | `202607250005_corrective_seller_document_transaction_continuity.sql` |

## Next Step

Use the action on each row to decide the phase 3 work:

- `apply_original_after_dependency_check`: apply that single file to staging after preflight.
- `repair_only_after_smoke`: do not apply SQL; run smoke checks, then record staging ledger.
- `corrective_migration_required`: create an idempotent corrective migration before staging execution.
- `manual_data_review`: verify intended data rows and idempotency before choosing apply or repair.
