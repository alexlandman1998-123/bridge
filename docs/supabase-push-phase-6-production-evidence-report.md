# Supabase Push Phase 6 Production Evidence Report

Generated: 2026-07-25T19:42:43.035Z

## Scope

Phase 6 records production evidence into the closeout evidence file only after production evidence is complete. It does not apply SQL, repair a ledger, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Production evidence rows | 21 |
| Evidence files created | 0 |
| Evidence files existing | 21 |
| Complete production evidence rows | 21 |
| Pending production evidence rows | 0 |
| Closeout evidence rows recorded | 21 |
| Phase 5 production-ready rows | 21 |

## Routes

| Production Route | Rows |
| --- | --- |
| `production_apply_sql` | 17 |
| `production_no_sql_record_after_smoke` | 4 |

## Evidence Files

| Version | Stream | Production Route | Status | File State | Evidence File | Blockers |
| --- | --- | --- | --- | --- | --- | --- |
| `202607220001` | `legal_document_runtime` | `production_no_sql_record_after_smoke` | Complete | Existing | `docs/production-evidence/202607220001-legal_document_runtime.json` | None |
| `202607220002` | `legal_document_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607220002-legal_document_runtime.json` | None |
| `202607220003` | `legal_document_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607220003-legal_document_runtime.json` | None |
| `202607250002` | `legal_document_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607250002-legal_document_runtime.json` | None |
| `202607220005` | `legal_document_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607220005-legal_document_runtime.json` | None |
| `202607250003` | `legal_document_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607250003-legal_document_runtime.json` | None |
| `202607250004` | `legal_document_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607250004-legal_document_runtime.json` | None |
| `202607220008` | `legal_document_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607220008-legal_document_runtime.json` | None |
| `202607220009` | `legal_document_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607220009-legal_document_runtime.json` | None |
| `202607220010` | `legal_document_runtime` | `production_no_sql_record_after_smoke` | Complete | Existing | `docs/production-evidence/202607220010-legal_document_runtime.json` | None |
| `202607220011` | `legal_document_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607220011-legal_document_runtime.json` | None |
| `202607220012` | `legal_document_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607220012-legal_document_runtime.json` | None |
| `202607230004` | `legal_document_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607230004-legal_document_runtime.json` | None |
| `202607230005` | `legal_document_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607230005-legal_document_runtime.json` | None |
| `202607250006` | `legal_document_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607250006-legal_document_runtime.json` | None |
| `202607250005` | `seller_transaction_continuity` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607250005-seller_transaction_continuity.json` | None |
| `202607220013` | `bond_finance_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607220013-bond_finance_runtime.json` | None |
| `202607220014` | `bond_finance_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607220014-bond_finance_runtime.json` | None |
| `202607230013` | `attorney_workflow_runtime` | `production_no_sql_record_after_smoke` | Complete | Existing | `docs/production-evidence/202607230013-attorney_workflow_runtime.json` | None |
| `202607240001` | `workspace_profile_management` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607240001-workspace_profile_management.json` | None |
| `202607250001` | `other` | `production_no_sql_record_after_smoke` | Complete | Existing | `docs/production-evidence/202607250001-other.json` | None |

## Completion Rule

Production evidence is complete only when Phase 5 marked the row ready for production, target state is verified, production ledger is recorded, catalog/behavior/rollback checks pass, and a reviewer plus capture timestamp are recorded. Only complete rows are copied into `docs/supabase-phase-8-closeout-evidence.json`.
