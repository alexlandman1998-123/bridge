# Supabase Push Phase 4 Staging Evidence Report

Generated: 2026-08-01T21:05:33.170Z

## Scope

Phase 4 captures staging evidence files for the runner-eligible migration rows. It does not apply SQL, record ledger rows, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Runner-eligible rows | 36 |
| Evidence files created | 0 |
| Evidence files existing | 36 |
| Complete evidence rows | 36 |
| Pending evidence rows | 0 |

## Routes

| Route | Rows |
| --- | --- |
| `apply_original` | 30 |
| `repair_only` | 6 |

## Evidence Files

| Version | Stream | Route | Status | File State | Evidence File | Blockers |
| --- | --- | --- | --- | --- | --- | --- |
| `202607270013` | `legal_document_runtime` | `repair_only` | Complete | Existing | `docs/staging-evidence/202607270013-legal_document_runtime.json` | None |
| `202607270015` | `bond_finance_runtime` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607270015-bond_finance_runtime.json` | None |
| `202607280003` | `bond_finance_runtime` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280003-bond_finance_runtime.json` | None |
| `202607280004` | `bond_finance_runtime` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280004-bond_finance_runtime.json` | None |
| `202607280005` | `bond_finance_runtime` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280005-bond_finance_runtime.json` | None |
| `202607280006` | `bond_finance_runtime` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280006-bond_finance_runtime.json` | None |
| `202607280007` | `bond_finance_runtime` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280007-bond_finance_runtime.json` | None |
| `202607280008` | `bond_finance_runtime` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280008-bond_finance_runtime.json` | None |
| `202607280009` | `bond_finance_runtime` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280009-bond_finance_runtime.json` | None |
| `202607280010` | `bond_finance_runtime` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280010-bond_finance_runtime.json` | None |
| `202607280011` | `bond_finance_runtime` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280011-bond_finance_runtime.json` | None |
| `202607280012` | `bond_finance_runtime` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280012-bond_finance_runtime.json` | None |
| `202607280013` | `bond_finance_runtime` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280013-bond_finance_runtime.json` | None |
| `202607280014` | `bond_finance_runtime` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280014-bond_finance_runtime.json` | None |
| `202607280015` | `bond_finance_runtime` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280015-bond_finance_runtime.json` | None |
| `202607260008` | `other` | `repair_only` | Complete | Existing | `docs/staging-evidence/202607260008-other.json` | None |
| `202607270002` | `other` | `repair_only` | Complete | Existing | `docs/staging-evidence/202607270002-other.json` | None |
| `202607270009` | `other` | `repair_only` | Complete | Existing | `docs/staging-evidence/202607270009-other.json` | None |
| `202607270010` | `other` | `repair_only` | Complete | Existing | `docs/staging-evidence/202607270010-other.json` | None |
| `202607270011` | `other` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607270011-other.json` | None |
| `202607290005` | `other` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607290005-other.json` | None |
| `202607270014` | `other` | `repair_only` | Complete | Existing | `docs/staging-evidence/202607270014-other.json` | None |
| `202607280002` | `other` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280002-other.json` | None |
| `202607280016` | `other` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280016-other.json` | None |
| `202607280017` | `other` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280017-other.json` | None |
| `202607280018` | `other` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280018-other.json` | None |
| `202607280019` | `other` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280019-other.json` | None |
| `202607280020` | `other` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280020-other.json` | None |
| `202607280021` | `other` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280021-other.json` | None |
| `202607280022` | `other` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280022-other.json` | None |
| `202607280023` | `other` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280023-other.json` | None |
| `202607280024` | `other` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607280024-other.json` | None |
| `202607310006` | `other` | `apply_original` | Complete | Existing | `docs/staging-evidence/202607310006-other.json` | None |
| `202608010001` | `other` | `apply_original` | Complete | Existing | `docs/staging-evidence/202608010001-other.json` | None |
| `202608010002` | `other` | `apply_original` | Complete | Existing | `docs/staging-evidence/202608010002-other.json` | None |
| `202608010003` | `other` | `apply_original` | Complete | Existing | `docs/staging-evidence/202608010003-other.json` | None |

## Completion Rule

An evidence file is complete only when it has the real staging project ref, expected `sqlApplied` value, `stagingLedgerRecorded: true`, passing catalog/behavior/rollback checks, and both reviewer and approver names.
