# Supabase Push Phase 4 Staging Evidence Report

Generated: 2026-07-25T17:04:11.799Z

## Scope

Phase 4 captures staging evidence files for the runner-eligible migration rows. It does not apply SQL, record ledger rows, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Runner-eligible rows | 20 |
| Evidence files created | 0 |
| Evidence files existing | 20 |
| Complete evidence rows | 3 |
| Pending evidence rows | 17 |

## Routes

| Route | Rows |
| --- | --- |
| `apply_original` | 17 |
| `repair_only` | 3 |

## Evidence Files

| Version | Stream | Route | Status | File State | Evidence File | Blockers |
| --- | --- | --- | --- | --- | --- | --- |
| `202607220001` | `legal_document_runtime` | `repair_only` | Pending | Existing | `docs/staging-evidence/202607220001-legal_document_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607220002` | `legal_document_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607220002-legal_document_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607220003` | `legal_document_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607220003-legal_document_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607250002` | `legal_document_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607250002-legal_document_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607220005` | `legal_document_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607220005-legal_document_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607250003` | `legal_document_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607250003-legal_document_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607250004` | `legal_document_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607250004-legal_document_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607220008` | `legal_document_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607220008-legal_document_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607220009` | `legal_document_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607220009-legal_document_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607220010` | `legal_document_runtime` | `repair_only` | Pending | Existing | `docs/staging-evidence/202607220010-legal_document_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607220011` | `legal_document_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607220011-legal_document_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607220012` | `legal_document_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607220012-legal_document_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607230004` | `legal_document_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607230004-legal_document_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607230005` | `legal_document_runtime` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607230005-legal_document_runtime.json` | None |
| `202607240002` | `legal_document_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607240002-legal_document_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607250005` | `seller_transaction_continuity` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607250005-seller_transaction_continuity.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607220013` | `bond_finance_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607220013-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607220014` | `bond_finance_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607220014-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607230013` | `attorney_workflow_runtime` | `repair_only` | Complete | Existing | `docs/staging-evidence/202607230013-attorney_workflow_runtime.json` | None |
| `202607240001` | `workspace_profile_management` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607240001-workspace_profile_management.json` | None |

## Completion Rule

An evidence file is complete only when it has the real staging project ref, expected `sqlApplied` value, `stagingLedgerRecorded: true`, passing catalog/behavior/rollback checks, and both reviewer and approver names.
