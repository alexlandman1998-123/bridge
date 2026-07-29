# Supabase Push Phase 5 Production Promotion Report

Generated: 2026-07-29T19:45:01.899Z

## Scope

Phase 5 promotes runner-eligible rows to production only after reviewed staging evidence exists. This command is a planning gate: it does not apply SQL, repair a ledger, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Rows considered | 32 |
| Ready for production | 0 |
| Blocked | 32 |
| Production env configured | No |
| Production recovery locked | Yes |

## Routes

| Production Route | Rows |
| --- | --- |
| `production_apply_sql` | 26 |
| `production_no_sql_record_after_smoke` | 6 |

## Work Queue

| Version | Stream | Production Route | Ready | Staging Evidence | Blockers |
| --- | --- | --- | --- | --- | --- |
| `202607270013` | `legal_document_runtime` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/202607270013-legal_document_runtime.json` | `staging_evidence_missing` |
| `202607270015` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/202607270015-bond_finance_runtime.json` | `staging_evidence_missing` |
| `202607280003` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/202607280003-bond_finance_runtime.json` | `staging_evidence_missing` |
| `202607280004` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/202607280004-bond_finance_runtime.json` | `staging_evidence_missing` |
| `202607280005` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/202607280005-bond_finance_runtime.json` | `staging_evidence_missing` |
| `202607280006` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/202607280006-bond_finance_runtime.json` | `staging_evidence_missing` |
| `202607280007` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/202607280007-bond_finance_runtime.json` | `staging_evidence_missing` |
| `202607280008` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/202607280008-bond_finance_runtime.json` | `staging_evidence_missing` |
| `202607280009` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/202607280009-bond_finance_runtime.json` | `staging_evidence_missing` |
| `202607280010` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/202607280010-bond_finance_runtime.json` | `staging_evidence_missing` |
| `202607280011` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/202607280011-bond_finance_runtime.json` | `staging_evidence_missing` |
| `202607280012` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/202607280012-bond_finance_runtime.json` | `staging_evidence_missing` |
| `202607280013` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/202607280013-bond_finance_runtime.json` | `staging_evidence_missing` |
| `202607280014` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/202607280014-bond_finance_runtime.json` | `staging_evidence_missing` |
| `202607280015` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/202607280015-bond_finance_runtime.json` | `staging_evidence_missing` |
| `202607260008` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/202607260008-other.json` | `staging_evidence_missing` |
| `202607270002` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/202607270002-other.json` | `staging_evidence_missing` |
| `202607270009` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/202607270009-other.json` | `staging_evidence_missing` |
| `202607270010` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/202607270010-other.json` | `staging_evidence_missing` |
| `202607270011` | `other` | `production_apply_sql` | No | `docs/staging-evidence/202607270011-other.json` | `staging_evidence_missing` |
| `202607290005` | `other` | `production_apply_sql` | No | `docs/staging-evidence/202607290005-other.json` | `staging_evidence_missing` |
| `202607270014` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/202607270014-other.json` | `staging_evidence_missing` |
| `202607280002` | `other` | `production_apply_sql` | No | `docs/staging-evidence/202607280002-other.json` | `staging_evidence_missing` |
| `202607280016` | `other` | `production_apply_sql` | No | `docs/staging-evidence/202607280016-other.json` | `staging_evidence_missing` |
| `202607280017` | `other` | `production_apply_sql` | No | `docs/staging-evidence/202607280017-other.json` | `staging_evidence_missing` |
| `202607280018` | `other` | `production_apply_sql` | No | `docs/staging-evidence/202607280018-other.json` | `staging_evidence_missing` |
| `202607280019` | `other` | `production_apply_sql` | No | `docs/staging-evidence/202607280019-other.json` | `staging_evidence_missing` |
| `202607280020` | `other` | `production_apply_sql` | No | `docs/staging-evidence/202607280020-other.json` | `staging_evidence_missing` |
| `202607280021` | `other` | `production_apply_sql` | No | `docs/staging-evidence/202607280021-other.json` | `staging_evidence_missing` |
| `202607280022` | `other` | `production_apply_sql` | No | `docs/staging-evidence/202607280022-other.json` | `staging_evidence_missing` |
| `202607280023` | `other` | `production_apply_sql` | No | `docs/staging-evidence/202607280023-other.json` | `staging_evidence_missing` |
| `202607280024` | `other` | `production_apply_sql` | No | `docs/staging-evidence/202607280024-other.json` | `staging_evidence_missing` |

## Commands

No production commands are enabled yet because no rows have complete staging evidence.

## Required Environment Before Promotion

```bash
export SUPABASE_PRODUCTION_PROJECT_REF='isdowlnollckzvltkasn'
export SUPABASE_PRODUCTION_DB_URL='<production-direct-db-url>'
export SUPABASE_PRODUCTION_RECOVERY_CONFIRMED='I_HAVE_TESTED_PRODUCTION_RECOVERY'
```

Run `npm run supabase:push:lock-recovery` and complete `docs/supabase-production-recovery-evidence.json` before production promotion. Do not run broad `supabase db push`. Use `scripts/supabase-phase7-production-execution.mjs` one version at a time.
