# Supabase Push Phase 5 Production Promotion Report

Generated: 2026-09-06T16:55:20.463Z

## Scope

Phase 5 promotes runner-eligible rows to production only after reviewed staging evidence exists. This command is a planning gate: it does not apply SQL, repair a ledger, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Rows considered | 93 |
| Ready for production | 26 |
| Blocked | 67 |
| Production env configured | No |
| Production recovery locked | Yes |

## Routes

| Production Route | Rows |
| --- | --- |
| `production_apply_sql` | 53 |
| `production_no_sql_record_after_smoke` | 40 |

## Work Queue

| Version | Stream | Production Route | Ready | Staging Evidence | Blockers |
| --- | --- | --- | --- | --- | --- |
| `20260828203724` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/20260828203724-bond_finance_runtime.json` | None |
| `20260905100612` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/20260905100612-bond_finance_runtime.json` | None |
| `20260905100908` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/20260905100908-bond_finance_runtime.json` | None |
| `20260905101301` | `bond_finance_runtime` | `production_apply_sql` | Yes | `docs/staging-evidence/20260905101301-bond_finance_runtime.json` | None |
| `20260906163535` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/20260906163535-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260905102430` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/20260905102430-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260905102813` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/20260905102813-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260905102934` | `bond_finance_runtime` | `production_apply_sql` | No | `docs/staging-evidence/20260905102934-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260903094957` | `attorney_identity_access` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260903094957-attorney_identity_access.json` | `staging_evidence_missing` |
| `20260817174624` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260817174624-other.json` | `staging_evidence_missing` |
| `20260818203652` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260818203652-other.json` | `staging_evidence_missing` |
| `20260906163540` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260906163540-other.json` | `staging_evidence_missing` |
| `202608200002` | `other` | `production_apply_sql` | No | `docs/staging-evidence/202608200002-other.json` | `staging_evidence_missing` |
| `20260820160621` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260820160621-other.json` | `staging_evidence_missing` |
| `20260820174624` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260820174624-other.json` | `staging_evidence_missing` |
| `20260820192038` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260820192038-other.json` | `staging_evidence_missing` |
| `20260820192857` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260820192857-other.json` | `staging_evidence_missing` |
| `20260820193436` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260820193436-other.json` | `staging_evidence_missing` |
| `20260906163545` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260906163545-other.json` | `staging_evidence_missing` |
| `202608230002` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/202608230002-other.json` | None |
| `202608240001` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/202608240001-other.json` | None |
| `20260824084233` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260824084233-other.json` | `staging_evidence_missing` |
| `20260824091732` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/20260824091732-other.json` | None |
| `20260824092531` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260824092531-other.json` | `staging_evidence_missing` |
| `202608250001` | `other` | `production_apply_sql` | No | `docs/staging-evidence/202608250001-other.json` | `staging_evidence_missing` |
| `20260827081713` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/20260827081713-other.json` | None |
| `20260906163551` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260906163551-other.json` | `staging_evidence_missing` |
| `20260827091439` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/20260827091439-other.json` | None |
| `202608290001` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202608290001-other.json` | None |
| `202608290002` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/202608290002-other.json` | None |
| `20260829103738` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260829103738-other.json` | `staging_evidence_missing` |
| `20260829105514` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260829105514-other.json` | `staging_evidence_missing` |
| `20260829111644` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/20260829111644-other.json` | None |
| `20260829112135` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260829112135-other.json` | `staging_evidence_missing` |
| `20260829112530` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260829112530-other.json` | `staging_evidence_missing` |
| `20260829195657` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260829195657-other.json` | `staging_evidence_missing` |
| `20260906163555` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260906163555-other.json` | `staging_evidence_missing` |
| `20260830125035` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260830125035-other.json` | `staging_evidence_missing` |
| `20260830160810` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260830160810-other.json` | `staging_evidence_missing` |
| `20260831071807` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/20260831071807-other.json` | None |
| `20260831072652` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/20260831072652-other.json` | None |
| `20260831120000` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260831120000-other.json` | `staging_evidence_missing` |
| `20260831131538` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260831131538-other.json` | `staging_evidence_missing` |
| `20260831140736` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260831140736-other.json` | `staging_evidence_missing` |
| `20260831150740` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260831150740-other.json` | `staging_evidence_missing` |
| `20260831153322` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260831153322-other.json` | `staging_evidence_missing` |
| `20260831190341` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/20260831190341-other.json` | None |
| `20260906163601` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260906163601-other.json` | `staging_evidence_missing` |
| `20260906163615` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260906163615-other.json` | `staging_evidence_missing` |
| `20260901140943` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260901140943-other.json` | `staging_evidence_missing` |
| `20260901143358` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260901143358-other.json` | `staging_evidence_missing` |
| `20260901145225` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260901145225-other.json` | `staging_evidence_missing` |
| `20260901165511` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/20260901165511-other.json` | None |
| `20260901170254` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260901170254-other.json` | `staging_evidence_missing` |
| `20260901170909` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260901170909-other.json` | `staging_evidence_missing` |
| `20260901174924` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260901174924-other.json` | `staging_evidence_missing` |
| `20260902095249` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260902095249-other.json` | `staging_evidence_missing` |
| `20260902105303` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260902105303-other.json` | `staging_evidence_missing` |
| `20260903094624` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/20260903094624-other.json` | None |
| `20260906163622` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260906163622-other.json` | `staging_evidence_missing` |
| `20260903130012` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260903130012-other.json` | `staging_evidence_missing` |
| `20260905090353` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/20260905090353-other.json` | None |
| `20260905091122` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/20260905091122-other.json` | None |
| `20260905095152` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/20260905095152-other.json` | None |
| `20260906163617` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260906163617-other.json` | `staging_evidence_missing` |
| `20260906163629` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260906163629-other.json` | `staging_evidence_missing` |
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
| `20260906065759` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/20260906065759-other.json` | None |
| `20260906070515` | `other` | `production_apply_sql` | Yes | `docs/staging-evidence/20260906070515-other.json` | None |
| `20260906163638` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260906163638-other.json` | `staging_evidence_missing` |
| `20260906071644` | `other` | `production_apply_sql` | No | `docs/staging-evidence/20260906071644-other.json` | `staging_evidence_missing` |
| `20260906123000` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/20260906123000-other.json` | None |
| `20260906130000` | `other` | `production_no_sql_record_after_smoke` | No | `docs/staging-evidence/20260906130000-other.json` | `staging_evidence_missing` |
| `20260906133000` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/20260906133000-other.json` | None |
| `20260906134500` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/20260906134500-other.json` | None |
| `20260906140000` | `other` | `production_no_sql_record_after_smoke` | Yes | `docs/staging-evidence/20260906140000-other.json` | None |

## Commands

| Version | Command |
| --- | --- |
| `20260828203724` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 20260828203724 --staging-evidence docs/staging-evidence/20260828203724-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260828203724 --staging-evidence docs/staging-evidence/20260828203724-bond_finance_runtime.json --production-evidence docs/production-evidence/20260828203724-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `20260905100612` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 20260905100612 --staging-evidence docs/staging-evidence/20260905100612-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260905100612 --staging-evidence docs/staging-evidence/20260905100612-bond_finance_runtime.json --production-evidence docs/production-evidence/20260905100612-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `20260905100908` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 20260905100908 --staging-evidence docs/staging-evidence/20260905100908-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260905100908 --staging-evidence docs/staging-evidence/20260905100908-bond_finance_runtime.json --production-evidence docs/production-evidence/20260905100908-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `20260905101301` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 20260905101301 --staging-evidence docs/staging-evidence/20260905101301-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260905101301 --staging-evidence docs/staging-evidence/20260905101301-bond_finance_runtime.json --production-evidence docs/production-evidence/20260905101301-bond_finance_runtime.json --confirm APPLY_TO_PRODUCTION` |
| `202608230002` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202608230002 --staging-evidence docs/staging-evidence/202608230002-other.json --production-evidence docs/production-evidence/202608230002-other.json --confirm APPLY_TO_PRODUCTION` |
| `202608240001` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202608240001 --staging-evidence docs/staging-evidence/202608240001-other.json --production-evidence docs/production-evidence/202608240001-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260824091732` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260824091732 --staging-evidence docs/staging-evidence/20260824091732-other.json --production-evidence docs/production-evidence/20260824091732-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260827081713` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260827081713 --staging-evidence docs/staging-evidence/20260827081713-other.json --production-evidence docs/production-evidence/20260827081713-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260827091439` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260827091439 --staging-evidence docs/staging-evidence/20260827091439-other.json --production-evidence docs/production-evidence/20260827091439-other.json --confirm APPLY_TO_PRODUCTION` |
| `202608290001` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202608290001 --staging-evidence docs/staging-evidence/202608290001-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202608290001 --staging-evidence docs/staging-evidence/202608290001-other.json --production-evidence docs/production-evidence/202608290001-other.json --confirm APPLY_TO_PRODUCTION` |
| `202608290002` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 202608290002 --staging-evidence docs/staging-evidence/202608290002-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 202608290002 --staging-evidence docs/staging-evidence/202608290002-other.json --production-evidence docs/production-evidence/202608290002-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260829111644` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 20260829111644 --staging-evidence docs/staging-evidence/20260829111644-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260829111644 --staging-evidence docs/staging-evidence/20260829111644-other.json --production-evidence docs/production-evidence/20260829111644-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260831071807` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260831071807 --staging-evidence docs/staging-evidence/20260831071807-other.json --production-evidence docs/production-evidence/20260831071807-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260831072652` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260831072652 --staging-evidence docs/staging-evidence/20260831072652-other.json --production-evidence docs/production-evidence/20260831072652-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260831190341` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 20260831190341 --staging-evidence docs/staging-evidence/20260831190341-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260831190341 --staging-evidence docs/staging-evidence/20260831190341-other.json --production-evidence docs/production-evidence/20260831190341-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260901165511` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260901165511 --staging-evidence docs/staging-evidence/20260901165511-other.json --production-evidence docs/production-evidence/20260901165511-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260903094624` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260903094624 --staging-evidence docs/staging-evidence/20260903094624-other.json --production-evidence docs/production-evidence/20260903094624-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260905090353` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260905090353 --staging-evidence docs/staging-evidence/20260905090353-other.json --production-evidence docs/production-evidence/20260905090353-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260905091122` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 20260905091122 --staging-evidence docs/staging-evidence/20260905091122-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260905091122 --staging-evidence docs/staging-evidence/20260905091122-other.json --production-evidence docs/production-evidence/20260905091122-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260905095152` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 20260905095152 --staging-evidence docs/staging-evidence/20260905095152-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260905095152 --staging-evidence docs/staging-evidence/20260905095152-other.json --production-evidence docs/production-evidence/20260905095152-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260906065759` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 20260906065759 --staging-evidence docs/staging-evidence/20260906065759-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260906065759 --staging-evidence docs/staging-evidence/20260906065759-other.json --production-evidence docs/production-evidence/20260906065759-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260906070515` | `node scripts/supabase-phase7-production-execution.mjs --apply-sql --version 20260906070515 --staging-evidence docs/staging-evidence/20260906070515-other.json --confirm APPLY_TO_PRODUCTION`<br>`node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260906070515 --staging-evidence docs/staging-evidence/20260906070515-other.json --production-evidence docs/production-evidence/20260906070515-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260906123000` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260906123000 --staging-evidence docs/staging-evidence/20260906123000-other.json --production-evidence docs/production-evidence/20260906123000-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260906133000` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260906133000 --staging-evidence docs/staging-evidence/20260906133000-other.json --production-evidence docs/production-evidence/20260906133000-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260906134500` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260906134500 --staging-evidence docs/staging-evidence/20260906134500-other.json --production-evidence docs/production-evidence/20260906134500-other.json --confirm APPLY_TO_PRODUCTION` |
| `20260906140000` | `node scripts/supabase-phase7-production-execution.mjs --record-applied --version 20260906140000 --staging-evidence docs/staging-evidence/20260906140000-other.json --production-evidence docs/production-evidence/20260906140000-other.json --confirm APPLY_TO_PRODUCTION` |

## Required Environment Before Promotion

```bash
export SUPABASE_PRODUCTION_PROJECT_REF='isdowlnollckzvltkasn'
export SUPABASE_PRODUCTION_DB_URL='<production-direct-db-url>'
export SUPABASE_PRODUCTION_RECOVERY_CONFIRMED='I_HAVE_TESTED_PRODUCTION_RECOVERY'
```

Run `npm run supabase:push:lock-recovery` and complete `docs/supabase-production-recovery-evidence.json` before production promotion. Do not run broad `supabase db push`. Use `scripts/supabase-phase7-production-execution.mjs` one version at a time.
