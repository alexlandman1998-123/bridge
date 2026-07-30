# Supabase Push Phase 4 Staging Evidence Report

Generated: 2026-07-29T19:58:07.963Z

## Scope

Phase 4 captures staging evidence files for the runner-eligible migration rows. It does not apply SQL, record ledger rows, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Runner-eligible rows | 32 |
| Evidence files created | 0 |
| Evidence files existing | 32 |
| Complete evidence rows | 0 |
| Pending evidence rows | 32 |

## Routes

| Route | Rows |
| --- | --- |
| `apply_original` | 26 |
| `repair_only` | 6 |

## Evidence Files

| Version | Stream | Route | Status | File State | Evidence File | Blockers |
| --- | --- | --- | --- | --- | --- | --- |
| `202607270013` | `legal_document_runtime` | `repair_only` | Pending | Existing | `docs/staging-evidence/202607270013-legal_document_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607270015` | `bond_finance_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607270015-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280003` | `bond_finance_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280003-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280004` | `bond_finance_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280004-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280005` | `bond_finance_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280005-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280006` | `bond_finance_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280006-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280007` | `bond_finance_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280007-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280008` | `bond_finance_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280008-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280009` | `bond_finance_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280009-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280010` | `bond_finance_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280010-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280011` | `bond_finance_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280011-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280012` | `bond_finance_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280012-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280013` | `bond_finance_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280013-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280014` | `bond_finance_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280014-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280015` | `bond_finance_runtime` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280015-bond_finance_runtime.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607260008` | `other` | `repair_only` | Pending | Existing | `docs/staging-evidence/202607260008-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607270002` | `other` | `repair_only` | Pending | Existing | `docs/staging-evidence/202607270002-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607270009` | `other` | `repair_only` | Pending | Existing | `docs/staging-evidence/202607270009-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607270010` | `other` | `repair_only` | Pending | Existing | `docs/staging-evidence/202607270010-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607270011` | `other` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607270011-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607290005` | `other` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607290005-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607270014` | `other` | `repair_only` | Pending | Existing | `docs/staging-evidence/202607270014-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280002` | `other` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280002-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280016` | `other` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280016-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280017` | `other` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280017-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280018` | `other` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280018-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280019` | `other` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280019-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280020` | `other` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280020-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280021` | `other` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280021-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280022` | `other` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280022-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280023` | `other` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280023-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |
| `202607280024` | `other` | `apply_original` | Pending | Existing | `docs/staging-evidence/202607280024-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`reviewer_pending`<br>`approver_pending` |

## Completion Rule

An evidence file is complete only when it has the real staging project ref, expected `sqlApplied` value, `stagingLedgerRecorded: true`, passing catalog/behavior/rollback checks, and both reviewer and approver names.
