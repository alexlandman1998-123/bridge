# Supabase Push Phase 5 Production Promotion Report

Generated: 2026-07-25T19:22:27.238Z

## Scope

Phase 5 promotes runner-eligible rows to production only after reviewed staging evidence exists. This command is a planning gate: it does not apply SQL, repair a ledger, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Rows considered | 21 |
| Ready for production | 21 |
| Blocked | 0 |
| Production env configured | No |
| Production recovery locked | Yes |

## Routes

| Production Route | Rows |
| --- | --- |
| `production_apply_sql` | 17 |
| `production_no_sql_record_after_smoke` | 4 |

## Work Queue

| Version | Stream | Production Route | Ready | Staging Evidence | Blockers |
| --- | --- | --- | --- | --- | --- |
| `202607220001` | `legal_document_runtime` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/202607220001-legal_document_runtime.json` | None |
| `202607220002` | `legal_document_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607220002-legal_document_runtime.json` | None |
| `202607220003` | `legal_document_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607220003-legal_document_runtime.json` | None |
| `202607250002` | `legal_document_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607250002-legal_document_runtime.json` | None |
| `202607220005` | `legal_document_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607220005-legal_document_runtime.json` | None |
| `202607250003` | `legal_document_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607250003-legal_document_runtime.json` | None |
| `202607250004` | `legal_document_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607250004-legal_document_runtime.json` | None |
| `202607220008` | `legal_document_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607220008-legal_document_runtime.json` | None |
| `202607220009` | `legal_document_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607220009-legal_document_runtime.json` | None |
| `202607220010` | `legal_document_runtime` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/202607220010-legal_document_runtime.json` | None |
| `202607220011` | `legal_document_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607220011-legal_document_runtime.json` | None |
| `202607220012` | `legal_document_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607220012-legal_document_runtime.json` | None |
| `202607230004` | `legal_document_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607230004-legal_document_runtime.json` | None |
| `202607230005` | `legal_document_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607230005-legal_document_runtime.json` | None |
| `202607250006` | `legal_document_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607250006-legal_document_runtime.json` | None |
| `202607250005` | `seller_transaction_continuity` | `production_apply_sql` | Yes | `docs/staging-evidence/202607250005-seller_transaction_continuity.json` | None |
| `202607220013` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607220013-bond_finance_runtime.json` | None |
| `202607220014` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/202607220014-bond_finance_runtime.json` | None |
| `202607230013` | `attorney_workflow_runtime` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/202607230013-attorney_workflow_runtime.json` | None |
| `202607240001` | `workspace_profile_management` | `production_apply_sql` | Yes | `docs/staging-evidence/202607240001-workspace_profile_management.json` | None |
| `202607250001` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/202607250001-other.json` | None |

## Commands

| Version | Command |
| --- | --- |
| `202607220001` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607220001 --staging-evidence docs/staging-evidence/202607220001-legal_document_runtime.json --production-evidence docs/production-evidence/202607220001-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607220002` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607220002 --staging-evidence docs/staging-evidence/202607220002-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607220002 --staging-evidence docs/staging-evidence/202607220002-legal_document_runtime.json --production-evidence docs/production-evidence/202607220002-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607220003` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607220003 --staging-evidence docs/staging-evidence/202607220003-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607220003 --staging-evidence docs/staging-evidence/202607220003-legal_document_runtime.json --production-evidence docs/production-evidence/202607220003-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607250002` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607250002 --staging-evidence docs/staging-evidence/202607250002-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607250002 --staging-evidence docs/staging-evidence/202607250002-legal_document_runtime.json --production-evidence docs/production-evidence/202607250002-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607220005` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607220005 --staging-evidence docs/staging-evidence/202607220005-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607220005 --staging-evidence docs/staging-evidence/202607220005-legal_document_runtime.json --production-evidence docs/production-evidence/202607220005-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607250003` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607250003 --staging-evidence docs/staging-evidence/202607250003-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607250003 --staging-evidence docs/staging-evidence/202607250003-legal_document_runtime.json --production-evidence docs/production-evidence/202607250003-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607250004` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607250004 --staging-evidence docs/staging-evidence/202607250004-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607250004 --staging-evidence docs/staging-evidence/202607250004-legal_document_runtime.json --production-evidence docs/production-evidence/202607250004-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607220008` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607220008 --staging-evidence docs/staging-evidence/202607220008-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607220008 --staging-evidence docs/staging-evidence/202607220008-legal_document_runtime.json --production-evidence docs/production-evidence/202607220008-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607220009` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607220009 --staging-evidence docs/staging-evidence/202607220009-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607220009 --staging-evidence docs/staging-evidence/202607220009-legal_document_runtime.json --production-evidence docs/production-evidence/202607220009-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607220010` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607220010 --staging-evidence docs/staging-evidence/202607220010-legal_document_runtime.json --production-evidence docs/production-evidence/202607220010-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607220011` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607220011 --staging-evidence docs/staging-evidence/202607220011-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607220011 --staging-evidence docs/staging-evidence/202607220011-legal_document_runtime.json --production-evidence docs/production-evidence/202607220011-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607220012` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607220012 --staging-evidence docs/staging-evidence/202607220012-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607220012 --staging-evidence docs/staging-evidence/202607220012-legal_document_runtime.json --production-evidence docs/production-evidence/202607220012-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607230004` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607230004 --staging-evidence docs/staging-evidence/202607230004-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607230004 --staging-evidence docs/staging-evidence/202607230004-legal_document_runtime.json --production-evidence docs/production-evidence/202607230004-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607230005` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607230005 --staging-evidence docs/staging-evidence/202607230005-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607230005 --staging-evidence docs/staging-evidence/202607230005-legal_document_runtime.json --production-evidence docs/production-evidence/202607230005-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607250006` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607250006 --staging-evidence docs/staging-evidence/202607250006-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607250006 --staging-evidence docs/staging-evidence/202607250006-legal_document_runtime.json --production-evidence docs/production-evidence/202607250006-legal_document_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607250005` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607250005 --staging-evidence docs/staging-evidence/202607250005-seller_transaction_continuity.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607250005 --staging-evidence docs/staging-evidence/202607250005-seller_transaction_continuity.json --production-evidence docs/production-evidence/202607250005-seller_transaction_continuity.json --confirm APPLY_TO_PRODUCTION` |
| `202607220013` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607220013 --staging-evidence docs/staging-evidence/202607220013-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607220013 --staging-evidence docs/staging-evidence/202607220013-bond_finance_runtime.json --production-evidence docs/production-evidence/202607220013-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607220014` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607220014 --staging-evidence docs/staging-evidence/202607220014-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607220014 --staging-evidence docs/staging-evidence/202607220014-bond_finance_runtime.json --production-evidence docs/production-evidence/202607220014-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607230013` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607230013 --staging-evidence docs/staging-evidence/202607230013-attorney_workflow_runtime.json --production-evidence docs/production-evidence/202607230013-attorney_workflow_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202607240001` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202607240001 --staging-evidence docs/staging-evidence/202607240001-workspace_profile_management.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607240001 --staging-evidence docs/staging-evidence/202607240001-workspace_profile_management.json --production-evidence docs/production-evidence/202607240001-workspace_profile_management.json --confirm APPLY_TO_PRODUCTION` |
| `202607250001` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202607250001 --staging-evidence docs/staging-evidence/202607250001-other.json --production-evidence docs/production-evidence/202607250001-other.json --confirm APPLY_TO_PRODUCTION` |

## Required Environment Before Promotion

```bash
export SUPABASE_PRODUCTION_PROJECT_REF='isdowlnollckzvltkasn'
export SUPABASE_PRODUCTION_DB_URL='<production-direct-db-url>'
export SUPABASE_PRODUCTION_RECOVERY_CONFIRMED='I_HAVE_TESTED_PRODUCTION_RECOVERY'
```

Run `npm run supabase:push:lock-recovery` and complete `docs/supabase-production-recovery-evidence.json` before production promotion. Do not run broad `supabase db push`. Use `scripts/supabase-phase7-production-execution.mjs` one version at a time.
