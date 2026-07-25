# Supabase Push Staging Evidence Completion Report

Generated: 2026-07-25T19:20:52.516Z

## Scope

This gate validates completion readiness for the current runner-eligible staging rows. It does not apply SQL, record staging ledgers, relink Supabase, or invent evidence.

## Summary

| Field | Value |
| --- | --- |
| Runner-eligible rows | 21 |
| Complete staging evidence rows | 21 |
| Pending staging evidence rows | 0 |
| Staging environment configured | Yes |
| Phase 1 receipt ready | Yes |

## Route Summary

| Route | Rows |
| --- | --- |
| `apply_original` | 17 |
| `repair_only` | 4 |

## Blocker Counts

No blockers.

## Work Queue

| Version | Stream | Route | Status | Evidence | Blockers |
| --- | --- | --- | --- | --- | --- |
| `202607220001` | `legal_document_runtime` | `repair_only` | Complete | `docs/staging-evidence/202607220001-legal_document_runtime.json` | None |
| `202607220002` | `legal_document_runtime` | `apply_original` | Complete | `docs/staging-evidence/202607220002-legal_document_runtime.json` | None |
| `202607220003` | `legal_document_runtime` | `apply_original` | Complete | `docs/staging-evidence/202607220003-legal_document_runtime.json` | None |
| `202607250002` | `legal_document_runtime` | `apply_original` | Complete | `docs/staging-evidence/202607250002-legal_document_runtime.json` | None |
| `202607220005` | `legal_document_runtime` | `apply_original` | Complete | `docs/staging-evidence/202607220005-legal_document_runtime.json` | None |
| `202607250003` | `legal_document_runtime` | `apply_original` | Complete | `docs/staging-evidence/202607250003-legal_document_runtime.json` | None |
| `202607250004` | `legal_document_runtime` | `apply_original` | Complete | `docs/staging-evidence/202607250004-legal_document_runtime.json` | None |
| `202607220008` | `legal_document_runtime` | `apply_original` | Complete | `docs/staging-evidence/202607220008-legal_document_runtime.json` | None |
| `202607220009` | `legal_document_runtime` | `apply_original` | Complete | `docs/staging-evidence/202607220009-legal_document_runtime.json` | None |
| `202607220010` | `legal_document_runtime` | `repair_only` | Complete | `docs/staging-evidence/202607220010-legal_document_runtime.json` | None |
| `202607220011` | `legal_document_runtime` | `apply_original` | Complete | `docs/staging-evidence/202607220011-legal_document_runtime.json` | None |
| `202607220012` | `legal_document_runtime` | `apply_original` | Complete | `docs/staging-evidence/202607220012-legal_document_runtime.json` | None |
| `202607230004` | `legal_document_runtime` | `apply_original` | Complete | `docs/staging-evidence/202607230004-legal_document_runtime.json` | None |
| `202607230005` | `legal_document_runtime` | `apply_original` | Complete | `docs/staging-evidence/202607230005-legal_document_runtime.json` | None |
| `202607250006` | `legal_document_runtime` | `apply_original` | Complete | `docs/staging-evidence/202607250006-legal_document_runtime.json` | None |
| `202607250005` | `seller_transaction_continuity` | `apply_original` | Complete | `docs/staging-evidence/202607250005-seller_transaction_continuity.json` | None |
| `202607220013` | `bond_finance_runtime` | `apply_original` | Complete | `docs/staging-evidence/202607220013-bond_finance_runtime.json` | None |
| `202607220014` | `bond_finance_runtime` | `apply_original` | Complete | `docs/staging-evidence/202607220014-bond_finance_runtime.json` | None |
| `202607230013` | `attorney_workflow_runtime` | `repair_only` | Complete | `docs/staging-evidence/202607230013-attorney_workflow_runtime.json` | None |
| `202607240001` | `workspace_profile_management` | `apply_original` | Complete | `docs/staging-evidence/202607240001-workspace_profile_management.json` | None |
| `202607250001` | `other` | `repair_only` | Complete | `docs/staging-evidence/202607250001-other.json` | None |

## Environment Blockers

- None

## Phase 1 Receipt Blockers

- None
