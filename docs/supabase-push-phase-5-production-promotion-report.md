# Supabase Push Phase 5 Production Promotion Report

Generated: 2026-09-14T17:03:02.183Z

## Scope

Phase 5 promotes runner-eligible rows to production only after reviewed staging evidence exists. This command is a planning gate: it does not apply SQL, repair a ledger, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Rows considered | 25 |
| Ready for production | 4 |
| Blocked | 21 |
| Production env configured | No |
| Production recovery locked | Yes |

## Routes

| Production Route | Rows |
| --- | --- |
| `production_apply_sql` | 18 |
| `production_no_sql_record_after_smoke` | 7 |

## Work Queue

| Version | Stream | Production Route | Ready | Staging Evidence | Blockers |
| --- | --- | --- | --- | --- | --- |
| `20260913120000` | `rental_readiness` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/20260913120000-other.json` | None |
| `20260913123000` | `rental_readiness` | `production_apply_sql` | Yes | `docs/staging-evidence/20260913123000-other.json` | None |
| `20260913130000` | `rental_readiness` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260913130000-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |
| `20260913190000` | `document_configuration` | `production_apply_sql` | Yes | `docs/staging-evidence/20260913190000-other.json` | None |
| `20260914165606` | `document_configuration` | `production_apply_sql` | Yes | `docs/staging-evidence/20260914165606-other.json` | None |
| `20260913182014` | `fica_compliance` | `production_apply_sql` | No | `docs/staging-evidence/20260913182014-other.json` | `staging_evidence_missing` |
| `20260913200000` | `fica_compliance` | `production_apply_sql` | No | `docs/staging-evidence/20260913200000-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |
| `20260913210000` | `fica_compliance` | `production_apply_sql` | No | `docs/staging-evidence/20260913210000-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |
| `20260913163747` | `transaction_fee_controls` | `production_apply_sql` | No | `docs/staging-evidence/20260913163747-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |
| `20260913164842` | `transaction_fee_controls` | `production_apply_sql` | No | `docs/staging-evidence/20260913164842-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |
| `20260913174500` | `transaction_fee_controls` | `production_apply_sql` | No | `docs/staging-evidence/20260913174500-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |
| `20260913164108` | `property24_analytics` | `production_apply_sql` | No | `docs/staging-evidence/20260913164108-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |
| `20260913164657` | `property24_analytics` | `production_apply_sql` | No | `docs/staging-evidence/20260913164657-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |
| `20260913165354` | `property24_analytics` | `production_apply_sql` | No | `docs/staging-evidence/20260913165354-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |
| `20260913182312` | `website_blog` | `production_apply_sql` | No | `docs/staging-evidence/20260913182312-other.json` | `staging_evidence_missing` |
| `20260913184108` | `website_blog` | `production_apply_sql` | No | `docs/staging-evidence/20260913184108-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |
| `20260913185826` | `website_blog` | `production_apply_sql` | No | `docs/staging-evidence/20260913185826-other.json` | `staging_evidence_missing` |
| `20260913191403` | `website_blog` | `production_apply_sql` | No | `docs/staging-evidence/20260913191403-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |
| `20260913193410` | `website_blog` | `production_apply_sql` | No | `docs/staging-evidence/20260913193410-other.json` | `staging_evidence_missing` |
| `20260913195118` | `website_blog` | `production_apply_sql` | No | `docs/staging-evidence/20260913195118-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |
| `20260914073546` | `email_delivery` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260914073546-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |
| `20260914073806` | `email_delivery` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260914073806-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |
| `20260914080412` | `email_delivery` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260914080412-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |
| `20260914080640` | `email_delivery` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260914080640-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |
| `20260914083450` | `website_operations` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260914083450-other.json` | `staging_ledger_not_recorded`<br>`catalog_checks_pending`<br>`behavior_checks_pending`<br>`rollback_or_no_residue_pending`<br>`approver_pending` |

## Commands

| Version | Command |
| --- | --- |
| `20260913120000` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260913120000 --staging-evidence docs/staging-evidence/20260913120000-other.json --production-evidence docs/production-evidence/20260913120000-rental_readiness.json --confirm APPLY_TO_PRODUCTION` |
| `20260913123000` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 20260913123000 --staging-evidence docs/staging-evidence/20260913123000-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260913123000 --staging-evidence docs/staging-evidence/20260913123000-other.json --production-evidence docs/production-evidence/20260913123000-rental_readiness.json --confirm APPLY_TO_PRODUCTION` |
| `20260913190000` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 20260913190000 --staging-evidence docs/staging-evidence/20260913190000-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260913190000 --staging-evidence docs/staging-evidence/20260913190000-other.json --production-evidence docs/production-evidence/20260913190000-document_configuration.json --confirm APPLY_TO_PRODUCTION` |
| `20260914165606` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 20260914165606 --staging-evidence docs/staging-evidence/20260914165606-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260914165606 --staging-evidence docs/staging-evidence/20260914165606-other.json --production-evidence docs/production-evidence/20260914165606-document_configuration.json --confirm APPLY_TO_PRODUCTION` |

## Required Environment Before Promotion

```bash
export SUPABASE_PRODUCTION_PROJECT_REF='isdowlnollckzvltkasn'
export SUPABASE_PRODUCTION_DB_URL='<production-direct-db-url>'
export SUPABASE_PRODUCTION_RECOVERY_CONFIRMED='I_HAVE_TESTED_PRODUCTION_RECOVERY'
```

Run `npm run supabase:push:lock-recovery` and complete `docs/supabase-production-recovery-evidence.json` before production promotion. Do not run broad `supabase db push`. Use `scripts/supabase-phase7-production-execution.mjs` one version at a time.
