# Supabase Phase 3 Legal Document Runtime Plan

Generated: 2026-07-25

## Scope

Phase 3 isolates the legal/document-generator migration stream so it can move through staging and production one reviewed row at a time. This phase does not run `db push`, `db reset`, broad `migration repair`, or any live data-changing SQL.

The stream is generated from `docs/supabase-phase-5-application-manifest.json` and executed only through:

- `node scripts/supabase-phase6-staging-execution.mjs`
- `node scripts/supabase-phase7-production-execution.mjs`

## Implemented

- Expanded the Phase 5 deployment stream classifier so all legal/document runtime rows are grouped under `legal_document_runtime`.
- Regenerated the Phase 5 module drift report and application manifest.
- Regenerated the Phase 8 closeout report.
- Verified that staging and production runners produce the same 15-row legal/document runtime plan.

## Legal Document Runtime Plan

| Version | Action | Evidence | File |
| --- | --- | --- | --- |
| `202607220001` | `repair_only_after_smoke` | `all_live` 1/1 | `202607220001_document_workspace_status_phase2.sql` |
| `202607220002` | `apply_original_after_dependency_check` | `none_live` 0/15 | `202607220002_authoritative_mandate_signing_delivery_phase0.sql` |
| `202607220003` | `apply_original_after_dependency_check` | `none_live` 0/2 | `202607220003_signable_packet_sent_phase1.sql` |
| `202607220004` | `corrective_migration_required` | `partial_live` 3/11 | `202607220004_canonical_otp_signing_phase2.sql` |
| `202607220005` | `apply_original_after_dependency_check` | `none_live` 0/1 | `202607220005_canonical_otp_seal_atomic_recovery.sql` |
| `202607220006` | `corrective_migration_required` | `partial_live` 2/5 | `202607220006_phase3_visual_signature_evidence.sql` |
| `202607220007` | `corrective_migration_required` | `partial_live` 3/4 | `202607220007_phase4_legal_runtime_metadata_immutability.sql` |
| `202607220008` | `apply_original_after_dependency_check` | `none_live` 0/6 | `202607220008_phase4_legal_template_release_integrity.sql` |
| `202607220009` | `apply_original_after_dependency_check` | `none_live` 0/4 | `202607220009_phase4_legal_release_provenance.sql` |
| `202607220010` | `repair_only_after_smoke` | `all_live` 5/5 | `202607220010_phase4_seller_portal_final_artifact_fence.sql` |
| `202607220011` | `apply_original_after_dependency_check` | `none_live` 0/5 | `202607220011_phase4_legal_release_persistence_fence.sql` |
| `202607220012` | `apply_original_after_dependency_check` | `none_live` 0/7 | `202607220012_phase5_legal_document_health_incident_integrity.sql` |
| `202607230004` | `apply_original_after_dependency_check` | `none_live` 0/10 | `202607230004_phase5_pilot_release_trace_integrity.sql` |
| `202607230005` | `apply_original_after_dependency_check` | `none_live` 0/26 | `202607230005_phase6_successor_release_epoch_integrity.sql` |
| `202607240002` | `manual_data_review` | `no_static_objects` | `202607240002_global_mandate_platform_default_phase2.sql` |

## Execution Rules

Each row must pass in order. The generated dependency chain starts with stream preflight, then follows the prior legal/document runtime version.

Action meanings:

- `apply_original_after_dependency_check`: apply that single migration only after staging prerequisite checks pass.
- `corrective_migration_required`: do not replay the original file blindly; production already has some objects, so create and test an idempotent corrective migration.
- `repair_only_after_smoke`: objects are already live; run module smoke checks, then record only that version as applied.
- `manual_data_review`: data-only or seed-like migration; verify intended rows and idempotency before choosing apply or repair.

## Current Blockers

Live mutation remains blocked by the repository gates:

- No staging target environment is configured: `SUPABASE_STAGING_PROJECT_REF`, `SUPABASE_STAGING_DB_URL`, and `SUPABASE_STAGING_RECOVERY_CONFIRMED`.
- The committed legal rollout receipts still contain placeholder project/source/artifact bindings.
- Production execution requires reviewed staging evidence for each version before it can apply SQL or record ledger state.
- Phase 8 closeout is still blocked because reviewed production evidence is incomplete for all 20 manifest rows.

## Read-Only Verification Commands

```bash
npm run supabase:phase5
npm run supabase:phase8
node scripts/supabase-phase6-staging-execution.mjs --plan --stream legal_document_runtime --json
node scripts/supabase-phase7-production-execution.mjs --plan --stream legal_document_runtime --json
```

