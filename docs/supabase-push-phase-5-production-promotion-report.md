# Supabase Push Phase 5 Production Promotion Report

Generated: 2026-09-06T15:54:49.772Z

## Scope

Phase 5 promotes runner-eligible rows to production only after reviewed staging evidence exists. This command is a planning gate: it does not apply SQL, repair a ledger, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Rows considered | 95 |
| Ready for production | 0 |
| Blocked | 95 |
| Production env configured | No |
| Production recovery locked | Yes |

## Routes

| Production Route | Rows |
| --- | --- |
| `blocked_corrective_required` | 11 |
| `blocked_manual_review` | 13 |
| `production_apply_sql` | 31 |
| `production_no_sql_record_after_smoke` | 40 |

## Work Queue

| Version | Stream | Production Route | Ready | Staging Evidence | Blockers |
| --- | --- | --- | --- | --- | --- |
| `20260828203724` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/20260828203724-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260905100612` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/20260905100612-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260905100908` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/20260905100908-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260905101301` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/20260905101301-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260905101931` | `bond_finance_runtime` | `blocked_corrective_required` | No | `docs/staging-evidence/20260905101931-bond_finance_runtime.json` | `upstream_corrective_required` |
| `20260905102430` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/20260905102430-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260905102813` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/20260905102813-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260905102934` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/20260905102934-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260903094957` | `attorney_identity_access` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260903094957-attorney_identity_access.json` | `staging_evidence_missing` |
| `20260817174624` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260817174624-other.json` | `staging_evidence_missing` |
| `20260818203652` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260818203652-other.json` | `staging_evidence_missing` |
| `202608200001` | `other` | `blocked_corrective_required` | No | `docs/staging-evidence/202608200001-other.json` | `upstream_corrective_required` |
| `202608200002` | `other` | `blocked_manual_review` | No | `docs/staging-evidence/202608200002-other.json` | `upstream_manual_review` |
| `20260820160621` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260820160621-other.json` | `staging_evidence_missing` |
| `20260820174624` | `other` | `blocked_manual_review` | No | `docs/staging-evidence/20260820174624-other.json` | `upstream_manual_review` |
| `20260820192038` | `other` | `blocked_manual_review` | No | `docs/staging-evidence/20260820192038-other.json` | `upstream_manual_review` |
| `20260820192857` | `other` | `blocked_manual_review` | No | `docs/staging-evidence/20260820192857-other.json` | `upstream_manual_review` |
| `20260820193436` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260820193436-other.json` | `staging_evidence_missing` |
| `202608230001` | `other` | `blocked_corrective_required` | No | `docs/staging-evidence/202608230001-other.json` | `upstream_corrective_required` |
| `202608230002` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/202608230002-other.json` | `staging_evidence_missing` |
| `202608240001` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/202608240001-other.json` | `staging_evidence_missing` |
| `20260824084233` | `other` | `blocked_manual_review` | No | `docs/staging-evidence/20260824084233-other.json` | `upstream_manual_review` |
| `20260824091732` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260824091732-other.json` | `staging_evidence_missing` |
| `20260824092531` | `other` | `blocked_manual_review` | No | `docs/staging-evidence/20260824092531-other.json` | `upstream_manual_review` |
| `202608250001` | `other` | `blocked_manual_review` | No | `docs/staging-evidence/202608250001-other.json` | `upstream_manual_review` |
| `20260827081713` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260827081713-other.json` | `staging_evidence_missing` |
| `20260827083108` | `other` | `blocked_corrective_required` | No | `docs/staging-evidence/20260827083108-other.json` | `upstream_corrective_required` |
| `20260827091439` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260827091439-other.json` | `staging_evidence_missing` |
| `202608290001` | `other` | `production_apply_sql` | No | `docs/staging-evidence/202608290001-other.json` | `staging_evidence_missing` |
| `202608290002` | `other` | `production_apply_sql` | No | `docs/staging-evidence/202608290002-other.json` | `staging_evidence_missing` |
| `20260829103738` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260829103738-other.json` | `staging_evidence_missing` |
| `20260829105514` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260829105514-other.json` | `staging_evidence_missing` |
| `20260829111644` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260829111644-other.json` | `staging_evidence_missing` |
| `20260829112135` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260829112135-other.json` | `staging_evidence_missing` |
| `20260829112530` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260829112530-other.json` | `staging_evidence_missing` |
| `20260829195657` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260829195657-other.json` | `staging_evidence_missing` |
| `20260829204153` | `other` | `blocked_corrective_required` | No | `docs/staging-evidence/20260829204153-other.json` | `upstream_corrective_required` |
| `20260830125035` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260830125035-other.json` | `staging_evidence_missing` |
| `20260830160810` | `other` | `blocked_manual_review` | No | `docs/staging-evidence/20260830160810-other.json` | `upstream_manual_review` |
| `20260831071807` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260831071807-other.json` | `staging_evidence_missing` |
| `20260831072652` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260831072652-other.json` | `staging_evidence_missing` |
| `20260831120000` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260831120000-other.json` | `staging_evidence_missing` |
| `20260831131538` | `other` | `blocked_manual_review` | No | `docs/staging-evidence/20260831131538-other.json` | `upstream_manual_review` |
| `20260831140736` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260831140736-other.json` | `staging_evidence_missing` |
| `20260831150740` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260831150740-other.json` | `staging_evidence_missing` |
| `20260831153322` | `other` | `blocked_manual_review` | No | `docs/staging-evidence/20260831153322-other.json` | `upstream_manual_review` |
| `20260831190341` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260831190341-other.json` | `staging_evidence_missing` |
| `20260901075131` | `other` | `blocked_corrective_required` | No | `docs/staging-evidence/20260901075131-other.json` | `upstream_corrective_required` |
| `20260901110612` | `other` | `blocked_corrective_required` | No | `docs/staging-evidence/20260901110612-other.json` | `upstream_corrective_required` |
| `20260901140943` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260901140943-other.json` | `staging_evidence_missing` |
| `20260901143358` | `other` | `blocked_manual_review` | No | `docs/staging-evidence/20260901143358-other.json` | `upstream_manual_review` |
| `20260901145225` | `other` | `blocked_manual_review` | No | `docs/staging-evidence/20260901145225-other.json` | `upstream_manual_review` |
| `20260901165511` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260901165511-other.json` | `staging_evidence_missing` |
| `20260901170254` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260901170254-other.json` | `staging_evidence_missing` |
| `20260901170909` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260901170909-other.json` | `staging_evidence_missing` |
| `20260901174924` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260901174924-other.json` | `staging_evidence_missing` |
| `20260902074000` | `other` | `blocked_manual_review` | No | `docs/staging-evidence/20260902074000-other.json` | `upstream_manual_review` |
| `20260902085300` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260902085300-other.json` | `staging_evidence_missing` |
| `20260902095249` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260902095249-other.json` | `staging_evidence_missing` |
| `20260902105303` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260902105303-other.json` | `staging_evidence_missing` |
| `20260903094624` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260903094624-other.json` | `staging_evidence_missing` |
| `20260903122031` | `other` | `blocked_corrective_required` | No | `docs/staging-evidence/20260903122031-other.json` | `upstream_corrective_required` |
| `20260903130012` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260903130012-other.json` | `staging_evidence_missing` |
| `20260905090353` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260905090353-other.json` | `staging_evidence_missing` |
| `20260905091122` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260905091122-other.json` | `staging_evidence_missing` |
| `20260905095152` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260905095152-other.json` | `staging_evidence_missing` |
| `20260905120250` | `other` | `blocked_corrective_required` | No | `docs/staging-evidence/20260905120250-other.json` | `upstream_corrective_required` |
| `20260905125639` | `other` | `blocked_corrective_required` | No | `docs/staging-evidence/20260905125639-other.json` | `upstream_corrective_required` |
| `20260905141005` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260905141005-other.json` | `staging_evidence_missing` |
| `20260905141007` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260905141007-other.json` | `staging_evidence_missing` |
| `20260905141008` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260905141008-other.json` | `staging_evidence_missing` |
| `20260905141009` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260905141009-other.json` | `staging_evidence_missing` |
| `20260905141010` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260905141010-other.json` | `staging_evidence_missing` |
| `20260905141011` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260905141011-other.json` | `staging_evidence_missing` |
| `20260905141012` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260905141012-other.json` | `staging_evidence_missing` |
| `20260905141013` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260905141013-other.json` | `staging_evidence_missing` |
| `20260905141014` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260905141014-other.json` | `staging_evidence_missing` |
| `20260905141015` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260905141015-other.json` | `staging_evidence_missing` |
| `20260905141016` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260905141016-other.json` | `staging_evidence_missing` |
| `20260905141017` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260905141017-other.json` | `staging_evidence_missing` |
| `20260905141018` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260905141018-other.json` | `staging_evidence_missing` |
| `20260905141019` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260905141019-other.json` | `staging_evidence_missing` |
| `20260905141020` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260905141020-other.json` | `staging_evidence_missing` |
| `20260905141021` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260905141021-other.json` | `staging_evidence_missing` |
| `20260905150420` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260905150420-other.json` | `staging_evidence_missing` |
| `20260906063435` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260906063435-other.json` | `staging_evidence_missing` |
| `20260906065759` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260906065759-other.json` | `staging_evidence_missing` |
| `20260906070515` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260906070515-other.json` | `staging_evidence_missing` |
| `20260906070938` | `other` | `blocked_corrective_required` | No | `docs/staging-evidence/20260906070938-other.json` | `upstream_corrective_required` |
| `20260906071644` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260906071644-other.json` | `staging_evidence_missing` |
| `20260906123000` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260906123000-other.json` | `staging_evidence_missing` |
| `20260906130000` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260906130000-other.json` | `staging_evidence_missing` |
| `20260906133000` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260906133000-other.json` | `staging_evidence_missing` |
| `20260906134500` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260906134500-other.json` | `staging_evidence_missing` |
| `20260906140000` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260906140000-other.json` | `staging_evidence_missing` |

## Commands

No production commands are enabled yet because no rows have complete staging evidence.

## Required Environment Before Promotion

```bash
export SUPABASE_PRODUCTION_PROJECT_REF='isdowlnollckzvltkasn'
export SUPABASE_PRODUCTION_DB_URL='<production-direct-db-url>'
export SUPABASE_PRODUCTION_RECOVERY_CONFIRMED='I_HAVE_TESTED_PRODUCTION_RECOVERY'
```

Run `npm run supabase:push:lock-recovery` and complete `docs/supabase-production-recovery-evidence.json` before production promotion. Do not run broad `supabase db push`. Use `scripts/supabase-phase7-production-execution.mjs` one version at a time.
