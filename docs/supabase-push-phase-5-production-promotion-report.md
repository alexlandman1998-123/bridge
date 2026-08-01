# Supabase Push Phase 5 Production Promotion Report

Generated: 2026-08-01T21:05:33.170Z

## Scope

Phase 5 promotes runner-eligible rows to production only after reviewed staging evidence exists. This command is a planning gate: it does not apply SQL, repair a ledger, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Rows considered | 36 |
| Ready for production | 36 |
| Blocked | 0 |
| Production env configured | No |
| Production recovery locked | Yes |

## Routes

| Production Route | Rows |
| --- | --- |
| `production_apply_sql` | 30 |
| `production_no_sql_record_after_smoke` | 6 |

## Work Queue

| Version | Stream | Production Route | Ready | Staging Evidence | Blockers |
| --- | --- | --- | --- | --- | --- |
| `202607270013` | `legal_document_runtime` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/202607270013-legal_document_runtime.json` | None |
| `202607270015` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607270015-bond_finance_runtime.json` | None |
| `202607280003` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280003-bond_finance_runtime.json` | None |
| `202607280004` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280004-bond_finance_runtime.json` | None |
| `202607280005` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280005-bond_finance_runtime.json` | None |
| `202607280006` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280006-bond_finance_runtime.json` | None |
| `202607280007` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280007-bond_finance_runtime.json` | None |
| `202607280008` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280008-bond_finance_runtime.json` | None |
| `202607280009` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280009-bond_finance_runtime.json` | None |
| `202607280010` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280010-bond_finance_runtime.json` | None |
| `202607280011` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280011-bond_finance_runtime.json` | None |
| `202607280012` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280012-bond_finance_runtime.json` | None |
| `202607280013` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280013-bond_finance_runtime.json` | None |
| `202607280014` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280014-bond_finance_runtime.json` | None |
| `202607280015` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280015-bond_finance_runtime.json` | None |
| `202607260008` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/202607260008-other.json` | None |
| `202607270002` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/202607270002-other.json` | None |
| `202607270009` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/202607270009-other.json` | None |
| `202607270010` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/202607270010-other.json` | None |
| `202607270011` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202607270011-other.json` | None |
| `202607290005` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202607290005-other.json` | None |
| `202607270014` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/202607270014-other.json` | None |
| `202607280002` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280002-other.json` | None |
| `202607280016` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280016-other.json` | None |
| `202607280017` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280017-other.json` | None |
| `202607280018` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280018-other.json` | None |
| `202607280019` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280019-other.json` | None |
| `202607280020` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280020-other.json` | None |
| `202607280021` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280021-other.json` | None |
| `202607280022` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280022-other.json` | None |
| `202607280023` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280023-other.json` | None |
| `202607280024` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202607280024-other.json` | None |
| `202607310006` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202607310006-other.json` | None |
| `202608010001` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202608010001-other.json` | None |
| `202608010002` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202608010002-other.json` | None |
| `202608010003` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202608010003-other.json` | None |

## Commands

| Version | Command |
| --- | --- |
| `202607270013` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607270013 --staging-evidence docs/staging-evidence/202607270013-legal_document_runtime.json --production-evidence docs/production-evidence/202607270013-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607270015` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607270015 --staging-evidence docs/staging-evidence/202607270015-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607270015 --staging-evidence docs/staging-evidence/202607270015-bond_finance_runtime.json --production-evidence docs/production-evidence/202607270015-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607280003` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280003 --staging-evidence docs/staging-evidence/202607280003-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280003 --staging-evidence docs/staging-evidence/202607280003-bond_finance_runtime.json --production-evidence docs/production-evidence/202607280003-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607280004` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280004 --staging-evidence docs/staging-evidence/202607280004-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280004 --staging-evidence docs/staging-evidence/202607280004-bond_finance_runtime.json --production-evidence docs/production-evidence/202607280004-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607280005` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280005 --staging-evidence docs/staging-evidence/202607280005-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280005 --staging-evidence docs/staging-evidence/202607280005-bond_finance_runtime.json --production-evidence docs/production-evidence/202607280005-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607280006` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280006 --staging-evidence docs/staging-evidence/202607280006-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280006 --staging-evidence docs/staging-evidence/202607280006-bond_finance_runtime.json --production-evidence docs/production-evidence/202607280006-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607280007` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280007 --staging-evidence docs/staging-evidence/202607280007-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280007 --staging-evidence docs/staging-evidence/202607280007-bond_finance_runtime.json --production-evidence docs/production-evidence/202607280007-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607280008` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280008 --staging-evidence docs/staging-evidence/202607280008-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280008 --staging-evidence docs/staging-evidence/202607280008-bond_finance_runtime.json --production-evidence docs/production-evidence/202607280008-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607280009` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280009 --staging-evidence docs/staging-evidence/202607280009-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280009 --staging-evidence docs/staging-evidence/202607280009-bond_finance_runtime.json --production-evidence docs/production-evidence/202607280009-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607280010` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280010 --staging-evidence docs/staging-evidence/202607280010-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280010 --staging-evidence docs/staging-evidence/202607280010-bond_finance_runtime.json --production-evidence docs/production-evidence/202607280010-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607280011` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280011 --staging-evidence docs/staging-evidence/202607280011-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280011 --staging-evidence docs/staging-evidence/202607280011-bond_finance_runtime.json --production-evidence docs/production-evidence/202607280011-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607280012` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280012 --staging-evidence docs/staging-evidence/202607280012-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280012 --staging-evidence docs/staging-evidence/202607280012-bond_finance_runtime.json --production-evidence docs/production-evidence/202607280012-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607280013` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280013 --staging-evidence docs/staging-evidence/202607280013-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280013 --staging-evidence docs/staging-evidence/202607280013-bond_finance_runtime.json --production-evidence docs/production-evidence/202607280013-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607280014` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280014 --staging-evidence docs/staging-evidence/202607280014-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280014 --staging-evidence docs/staging-evidence/202607280014-bond_finance_runtime.json --production-evidence docs/production-evidence/202607280014-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607280015` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280015 --staging-evidence docs/staging-evidence/202607280015-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280015 --staging-evidence docs/staging-evidence/202607280015-bond_finance_runtime.json --production-evidence docs/production-evidence/202607280015-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607260008` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607260008 --staging-evidence docs/staging-evidence/202607260008-other.json --production-evidence docs/production-evidence/202607260008-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607270002` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607270002 --staging-evidence docs/staging-evidence/202607270002-other.json --production-evidence docs/production-evidence/202607270002-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607270009` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607270009 --staging-evidence docs/staging-evidence/202607270009-other.json --production-evidence docs/production-evidence/202607270009-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607270010` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607270010 --staging-evidence docs/staging-evidence/202607270010-other.json --production-evidence docs/production-evidence/202607270010-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607270011` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607270011 --staging-evidence docs/staging-evidence/202607270011-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607270011 --staging-evidence docs/staging-evidence/202607270011-other.json --production-evidence docs/production-evidence/202607270011-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607290005` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607290005 --staging-evidence docs/staging-evidence/202607290005-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607290005 --staging-evidence docs/staging-evidence/202607290005-other.json --production-evidence docs/production-evidence/202607290005-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607270014` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607270014 --staging-evidence docs/staging-evidence/202607270014-other.json --production-evidence docs/production-evidence/202607270014-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607280002` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280002 --staging-evidence docs/staging-evidence/202607280002-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280002 --staging-evidence docs/staging-evidence/202607280002-other.json --production-evidence docs/production-evidence/202607280002-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607280016` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280016 --staging-evidence docs/staging-evidence/202607280016-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280016 --staging-evidence docs/staging-evidence/202607280016-other.json --production-evidence docs/production-evidence/202607280016-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607280017` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280017 --staging-evidence docs/staging-evidence/202607280017-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280017 --staging-evidence docs/staging-evidence/202607280017-other.json --production-evidence docs/production-evidence/202607280017-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607280018` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280018 --staging-evidence docs/staging-evidence/202607280018-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280018 --staging-evidence docs/staging-evidence/202607280018-other.json --production-evidence docs/production-evidence/202607280018-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607280019` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280019 --staging-evidence docs/staging-evidence/202607280019-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280019 --staging-evidence docs/staging-evidence/202607280019-other.json --production-evidence docs/production-evidence/202607280019-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607280020` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280020 --staging-evidence docs/staging-evidence/202607280020-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280020 --staging-evidence docs/staging-evidence/202607280020-other.json --production-evidence docs/production-evidence/202607280020-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607280021` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280021 --staging-evidence docs/staging-evidence/202607280021-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280021 --staging-evidence docs/staging-evidence/202607280021-other.json --production-evidence docs/production-evidence/202607280021-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607280022` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280022 --staging-evidence docs/staging-evidence/202607280022-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280022 --staging-evidence docs/staging-evidence/202607280022-other.json --production-evidence docs/production-evidence/202607280022-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607280023` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280023 --staging-evidence docs/staging-evidence/202607280023-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280023 --staging-evidence docs/staging-evidence/202607280023-other.json --production-evidence docs/production-evidence/202607280023-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607280024` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607280024 --staging-evidence docs/staging-evidence/202607280024-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607280024 --staging-evidence docs/staging-evidence/202607280024-other.json --production-evidence docs/production-evidence/202607280024-other.json --confirm APPLY_TO_PRODUCTION` |
| `202607310006` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607310006 --staging-evidence docs/staging-evidence/202607310006-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607310006 --staging-evidence docs/staging-evidence/202607310006-other.json --production-evidence docs/production-evidence/202607310006-other.json --confirm APPLY_TO_PRODUCTION` |
| `202608010001` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202608010001 --staging-evidence docs/staging-evidence/202608010001-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202608010001 --staging-evidence docs/staging-evidence/202608010001-other.json --production-evidence docs/production-evidence/202608010001-other.json --confirm APPLY_TO_PRODUCTION` |
| `202608010002` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202608010002 --staging-evidence docs/staging-evidence/202608010002-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202608010002 --staging-evidence docs/staging-evidence/202608010002-other.json --production-evidence docs/production-evidence/202608010002-other.json --confirm APPLY_TO_PRODUCTION` |
| `202608010003` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202608010003 --staging-evidence docs/staging-evidence/202608010003-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202608010003 --staging-evidence docs/staging-evidence/202608010003-other.json --production-evidence docs/production-evidence/202608010003-other.json --confirm APPLY_TO_PRODUCTION` |

## Required Environment Before Promotion

```bash
export SUPABASE_PRODUCTION_PROJECT_REF='isdowlnollckzvltkasn'
export SUPABASE_PRODUCTION_DB_URL='<production-direct-db-url>'
export SUPABASE_PRODUCTION_RECOVERY_CONFIRMED='I_HAVE_TESTED_PRODUCTION_RECOVERY'
```

Run `npm run supabase:push:lock-recovery` and complete `docs/supabase-production-recovery-evidence.json` before production promotion. Do not run broad `supabase db push`. Use `scripts/supabase-phase7-production-execution.mjs` one version at a time.
