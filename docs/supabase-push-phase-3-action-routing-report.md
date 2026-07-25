# Supabase Push Phase 3 Action Routing Report

Generated: 2026-07-25T19:10:00.590Z

## Scope

Phase 3 handles rows by action. It converts the phase 2 stream plans into explicit execution routes. This phase is read-only and does not apply SQL, record ledger rows, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Rows | 21 |
| Runner-eligible rows | 21 |
| Blocked rows | 0 |
| SQL-allowed rows | 17 |
| Ledger-allowed rows | 21 |

## Actions

| Action | Rows |
| --- | --- |
| `apply_original_after_dependency_check` | 17 |
| `repair_only_after_smoke` | 4 |

## Routes

| Route | Rows |
| --- | --- |
| `apply_original` | 17 |
| `repair_only` | 4 |

## Work Queue

| Version | Stream | Action | Route | Blocked | SQL Allowed | Ledger Allowed | File |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `202607220001` | `legal_document_runtime` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `202607220001_document_workspace_status_phase2.sql` |
| `202607220002` | `legal_document_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607220002_authoritative_mandate_signing_delivery_phase0.sql` |
| `202607220003` | `legal_document_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607220003_signable_packet_sent_phase1.sql` |
| `202607250002` | `legal_document_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607250002_corrective_canonical_otp_signing_phase2.sql` |
| `202607220005` | `legal_document_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607220005_canonical_otp_seal_atomic_recovery.sql` |
| `202607250003` | `legal_document_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607250003_corrective_visual_signature_evidence.sql` |
| `202607250004` | `legal_document_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607250004_corrective_legal_runtime_metadata_immutability.sql` |
| `202607220008` | `legal_document_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607220008_phase4_legal_template_release_integrity.sql` |
| `202607220009` | `legal_document_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607220009_phase4_legal_release_provenance.sql` |
| `202607220010` | `legal_document_runtime` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `202607220010_phase4_seller_portal_final_artifact_fence.sql` |
| `202607220011` | `legal_document_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607220011_phase4_legal_release_persistence_fence.sql` |
| `202607220012` | `legal_document_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607220012_phase5_legal_document_health_incident_integrity.sql` |
| `202607230004` | `legal_document_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607230004_phase5_pilot_release_trace_integrity.sql` |
| `202607230005` | `legal_document_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607230005_phase6_successor_release_epoch_integrity.sql` |
| `202607250006` | `legal_document_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607250006_corrective_global_mandate_platform_default_revision.sql` |
| `202607250005` | `seller_transaction_continuity` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607250005_corrective_seller_document_transaction_continuity.sql` |
| `202607220013` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607220013_bond_application_consent_and_finance_document_audit.sql` |
| `202607220014` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607220014_bond_partner_referral_terms_and_ledger.sql` |
| `202607230013` | `attorney_workflow_runtime` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `202607230013_attorney_workflow_step_completion_advance.sql` |
| `202607240001` | `workspace_profile_management` | `apply_original_after_dependency_check` | `apply_original` | No | Yes | Yes | `202607240001_agent_profile_management_rpc.sql` |
| `202607250001` | `other` | `repair_only_after_smoke` | `repair_only` | No | No | Yes | `202607250001_seller_portal_payload_optional_enrichment_guard.sql` |

## Commands

| Version | Command |
| --- | --- |
| `202607220001` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607220001 --evidence docs/staging-evidence/202607220001-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607220002` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607220002 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607220002 --evidence docs/staging-evidence/202607220002-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607220003` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607220003 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607220003 --evidence docs/staging-evidence/202607220003-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607250002` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607250002 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607250002 --evidence docs/staging-evidence/202607250002-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607220005` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607220005 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607220005 --evidence docs/staging-evidence/202607220005-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607250003` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607250003 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607250003 --evidence docs/staging-evidence/202607250003-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607250004` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607250004 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607250004 --evidence docs/staging-evidence/202607250004-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607220008` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607220008 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607220008 --evidence docs/staging-evidence/202607220008-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607220009` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607220009 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607220009 --evidence docs/staging-evidence/202607220009-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607220010` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607220010 --evidence docs/staging-evidence/202607220010-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607220011` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607220011 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607220011 --evidence docs/staging-evidence/202607220011-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607220012` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607220012 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607220012 --evidence docs/staging-evidence/202607220012-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607230004` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607230004 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607230004 --evidence docs/staging-evidence/202607230004-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607230005` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607230005 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607230005 --evidence docs/staging-evidence/202607230005-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607250006` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607250006 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607250006 --evidence docs/staging-evidence/202607250006-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607250005` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607250005 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607250005 --evidence docs/staging-evidence/202607250005-seller_transaction_continuity.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607220013` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607220013 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607220013 --evidence docs/staging-evidence/202607220013-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607220014` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607220014 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607220014 --evidence docs/staging-evidence/202607220014-bond_finance_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607230013` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607230013 --evidence docs/staging-evidence/202607230013-attorney_workflow_runtime.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607240001` | `node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607240001 --confirm APPLY_TO_STAGING_ONLY`<br>`node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607240001 --evidence docs/staging-evidence/202607240001-workspace_profile_management.json --confirm APPLY_TO_STAGING_ONLY` |
| `202607250001` | `node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607250001 --evidence docs/staging-evidence/202607250001-other.json --confirm APPLY_TO_STAGING_ONLY` |

## Next Step

Phase 4 should prepare or collect reviewed staging evidence for the runner-eligible rows. Blocked rows need corrective migrations or manual data review before they can enter the runner path.
