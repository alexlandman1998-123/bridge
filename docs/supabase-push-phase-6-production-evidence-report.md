# Supabase Push Phase 6 Production Evidence Report

Generated: 2026-07-31T17:48:53.926Z

## Scope

Phase 6 records production evidence into the closeout evidence file only after production evidence is complete. It does not apply SQL, repair a ledger, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Production evidence rows | 33 |
| Evidence files created | 0 |
| Evidence files existing | 33 |
| Complete production evidence rows | 33 |
| Pending production evidence rows | 0 |
| Closeout evidence rows recorded | 33 |
| Phase 5 production-ready rows | 33 |

## Routes

| Production Route | Rows |
| --- | --- |
| `production_apply_sql` | 27 |
| `production_no_sql_record_after_smoke` | 6 |

## Evidence Files

| Version | Stream | Production Route | Status | File State | Evidence File | Blockers |
| --- | --- | --- | --- | --- | --- | --- |
| `202607270013` | `legal_document_runtime` | `production_no_sql_record_after_smoke` | Complete | Existing | `docs/production-evidence/202607270013-legal_document_runtime.json` | None |
| `202607270015` | `bond_finance_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607270015-bond_finance_runtime.json` | None |
| `202607280003` | `bond_finance_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280003-bond_finance_runtime.json` | None |
| `202607280004` | `bond_finance_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280004-bond_finance_runtime.json` | None |
| `202607280005` | `bond_finance_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280005-bond_finance_runtime.json` | None |
| `202607280006` | `bond_finance_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280006-bond_finance_runtime.json` | None |
| `202607280007` | `bond_finance_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280007-bond_finance_runtime.json` | None |
| `202607280008` | `bond_finance_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280008-bond_finance_runtime.json` | None |
| `202607280009` | `bond_finance_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280009-bond_finance_runtime.json` | None |
| `202607280010` | `bond_finance_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280010-bond_finance_runtime.json` | None |
| `202607280011` | `bond_finance_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280011-bond_finance_runtime.json` | None |
| `202607280012` | `bond_finance_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280012-bond_finance_runtime.json` | None |
| `202607280013` | `bond_finance_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280013-bond_finance_runtime.json` | None |
| `202607280014` | `bond_finance_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280014-bond_finance_runtime.json` | None |
| `202607280015` | `bond_finance_runtime` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280015-bond_finance_runtime.json` | None |
| `202607260008` | `other` | `production_no_sql_record_after_smoke` | Complete | Existing | `docs/production-evidence/202607260008-other.json` | None |
| `202607270002` | `other` | `production_no_sql_record_after_smoke` | Complete | Existing | `docs/production-evidence/202607270002-other.json` | None |
| `202607270009` | `other` | `production_no_sql_record_after_smoke` | Complete | Existing | `docs/production-evidence/202607270009-other.json` | None |
| `202607270010` | `other` | `production_no_sql_record_after_smoke` | Complete | Existing | `docs/production-evidence/202607270010-other.json` | None |
| `202607270011` | `other` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607270011-other.json` | None |
| `202607290005` | `other` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607290005-other.json` | None |
| `202607270014` | `other` | `production_no_sql_record_after_smoke` | Complete | Existing | `docs/production-evidence/202607270014-other.json` | None |
| `202607280002` | `other` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280002-other.json` | None |
| `202607280016` | `other` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280016-other.json` | None |
| `202607280017` | `other` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280017-other.json` | None |
| `202607280018` | `other` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280018-other.json` | None |
| `202607280019` | `other` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280019-other.json` | None |
| `202607280020` | `other` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280020-other.json` | None |
| `202607280021` | `other` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280021-other.json` | None |
| `202607280022` | `other` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280022-other.json` | None |
| `202607280023` | `other` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280023-other.json` | None |
| `202607280024` | `other` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607280024-other.json` | None |
| `202607310006` | `other` | `production_apply_sql` | Complete | Existing | `docs/production-evidence/202607310006-other.json` | None |

## Completion Rule

Production evidence is complete only when Phase 5 marked the row ready for production, target state is verified, production ledger is recorded, catalog/behavior/rollback checks pass, and a reviewer plus capture timestamp are recorded. Only complete rows are copied into `docs/supabase-phase-8-closeout-evidence.json`.
