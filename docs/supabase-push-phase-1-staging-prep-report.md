# Supabase Push Phase 1 Staging Prep Report

Generated: 2026-07-25T15:04:16.133Z

## Scope

Phase 1 prepares the staging evidence package for the migration push path. It does not apply SQL, repair any ledger, relink the Supabase project, or modify production.

## Outputs

- `docs/supabase-push-phase-1-staging-evidence-templates.json`
- `docs/supabase-push-phase-1-staging-prep-report.md`

## Manifest Summary

| Field | Value |
| --- | --- |
| Manifest rows | 20 |
| Runner-eligible rows | 15 |
| Blocked rows requiring corrective/manual work | 5 |

## Streams

| Stream | Rows |
| --- | --- |
| `attorney_workflow_runtime` | 1 |
| `bond_finance_runtime` | 2 |
| `legal_document_runtime` | 15 |
| `seller_transaction_continuity` | 1 |
| `workspace_profile_management` | 1 |

## Actions

| Action | Rows |
| --- | --- |
| `apply_original_after_dependency_check` | 12 |
| `corrective_migration_required` | 4 |
| `manual_data_review` | 1 |
| `repair_only_after_smoke` | 3 |

## Runner Eligibility

| Eligibility | Rows |
| --- | --- |
| `blocked_create_corrective_migration` | 4 |
| `blocked_manual_data_review` | 1 |
| `staging_apply_then_record` | 12 |
| `staging_record_only_after_smoke` | 3 |

## Work Queue

| Version | Stream | Action | Object Status | Eligibility | File |
| --- | --- | --- | --- | --- | --- |
| `202607220001` | `legal_document_runtime` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `202607220001_document_workspace_status_phase2.sql` |
| `202607220002` | `legal_document_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607220002_authoritative_mandate_signing_delivery_phase0.sql` |
| `202607220003` | `legal_document_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607220003_signable_packet_sent_phase1.sql` |
| `202607220004` | `legal_document_runtime` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `202607220004_canonical_otp_signing_phase2.sql` |
| `202607220005` | `legal_document_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607220005_canonical_otp_seal_atomic_recovery.sql` |
| `202607220006` | `legal_document_runtime` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `202607220006_phase3_visual_signature_evidence.sql` |
| `202607220007` | `legal_document_runtime` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `202607220007_phase4_legal_runtime_metadata_immutability.sql` |
| `202607220008` | `legal_document_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607220008_phase4_legal_template_release_integrity.sql` |
| `202607220009` | `legal_document_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607220009_phase4_legal_release_provenance.sql` |
| `202607220010` | `legal_document_runtime` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `202607220010_phase4_seller_portal_final_artifact_fence.sql` |
| `202607220011` | `legal_document_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607220011_phase4_legal_release_persistence_fence.sql` |
| `202607220012` | `legal_document_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607220012_phase5_legal_document_health_incident_integrity.sql` |
| `202607230004` | `legal_document_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607230004_phase5_pilot_release_trace_integrity.sql` |
| `202607230005` | `legal_document_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607230005_phase6_successor_release_epoch_integrity.sql` |
| `202607240002` | `legal_document_runtime` | `manual_data_review` | `no_static_objects` | `blocked_manual_data_review` | `202607240002_global_mandate_platform_default_phase2.sql` |
| `202607230001` | `seller_transaction_continuity` | `corrective_migration_required` | `partial_live` | `blocked_create_corrective_migration` | `202607230001_reconcile_seller_document_transaction_continuity.sql` |
| `202607220013` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607220013_bond_application_consent_and_finance_document_audit.sql` |
| `202607220014` | `bond_finance_runtime` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607220014_bond_partner_referral_terms_and_ledger.sql` |
| `202607230013` | `attorney_workflow_runtime` | `repair_only_after_smoke` | `all_live` | `staging_record_only_after_smoke` | `202607230013_attorney_workflow_step_completion_advance.sql` |
| `202607240001` | `workspace_profile_management` | `apply_original_after_dependency_check` | `none_live` | `staging_apply_then_record` | `202607240001_agent_profile_management_rpc.sql` |

## Required Environment Before Applying

```bash
export SUPABASE_STAGING_PROJECT_REF='<staging-project-ref>'
export SUPABASE_STAGING_DB_URL='postgresql://postgres:<password>@db.<staging-project-ref>.supabase.co:5432/postgres?sslmode=require'
export SUPABASE_STAGING_RECOVERY_CONFIRMED='I_HAVE_A_RECOVERABLE_STAGING_BACKUP'
```

Use `scripts/supabase-phase6-staging-execution.mjs` for staging. Do not use broad `supabase db push`.
