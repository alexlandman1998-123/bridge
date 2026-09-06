# Supabase Push Staging Evidence Completion Report

Generated: 2026-09-06T16:17:50.843Z

## Scope

This gate validates completion readiness for the current runner-eligible staging rows. It does not apply SQL, record staging ledgers, relink Supabase, or invent evidence.

## Summary

| Field | Value |
| --- | --- |
| Runner-eligible rows | 70 |
| Complete staging evidence rows | 14 |
| Pending staging evidence rows | 56 |
| Staging environment configured | Yes |
| Phase 1 receipt ready | Yes |

## Route Summary

| Route | Rows |
| --- | --- |
| `apply_original` | 30 |
| `repair_only` | 40 |

## Blocker Counts

| Blocker | Rows |
| --- | --- |
| `staging_evidence_missing` | 56 |

## Work Queue

| Version | Stream | Route | Status | Evidence | Blockers |
| --- | --- | --- | --- | --- | --- |
| `20260828203724` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/20260828203724-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260905100612` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/20260905100612-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260905100908` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/20260905100908-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260905101301` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/20260905101301-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260905102430` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/20260905102430-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260905102813` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/20260905102813-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260905102934` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/20260905102934-bond_finance_runtime.json` | `staging_evidence_missing` |
| `20260903094957` | `attorney_identity_access` | `repair_only` | Pending | `docs/staging-evidence/20260903094957-attorney_identity_access.json` | `staging_evidence_missing` |
| `20260817174624` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260817174624-other.json` | `staging_evidence_missing` |
| `20260818203652` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260818203652-other.json` | `staging_evidence_missing` |
| `20260820160621` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260820160621-other.json` | `staging_evidence_missing` |
| `20260820193436` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260820193436-other.json` | `staging_evidence_missing` |
| `202608230002` | `other` | `repair_only` | Complete | `docs/staging-evidence/202608230002-other.json` | None |
| `202608240001` | `other` | `repair_only` | Complete | `docs/staging-evidence/202608240001-other.json` | None |
| `20260824091732` | `other` | `repair_only` | Complete | `docs/staging-evidence/20260824091732-other.json` | None |
| `20260827081713` | `other` | `repair_only` | Complete | `docs/staging-evidence/20260827081713-other.json` | None |
| `20260827091439` | `other` | `repair_only` | Complete | `docs/staging-evidence/20260827091439-other.json` | None |
| `202608290001` | `other` | `apply_original` | Pending | `docs/staging-evidence/202608290001-other.json` | `staging_evidence_missing` |
| `202608290002` | `other` | `apply_original` | Pending | `docs/staging-evidence/202608290002-other.json` | `staging_evidence_missing` |
| `20260829103738` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260829103738-other.json` | `staging_evidence_missing` |
| `20260829105514` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260829105514-other.json` | `staging_evidence_missing` |
| `20260829111644` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260829111644-other.json` | `staging_evidence_missing` |
| `20260829112135` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260829112135-other.json` | `staging_evidence_missing` |
| `20260829112530` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260829112530-other.json` | `staging_evidence_missing` |
| `20260829195657` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260829195657-other.json` | `staging_evidence_missing` |
| `20260830125035` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260830125035-other.json` | `staging_evidence_missing` |
| `20260831071807` | `other` | `repair_only` | Complete | `docs/staging-evidence/20260831071807-other.json` | None |
| `20260831072652` | `other` | `repair_only` | Complete | `docs/staging-evidence/20260831072652-other.json` | None |
| `20260831120000` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260831120000-other.json` | `staging_evidence_missing` |
| `20260831140736` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260831140736-other.json` | `staging_evidence_missing` |
| `20260831150740` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260831150740-other.json` | `staging_evidence_missing` |
| `20260831190341` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260831190341-other.json` | `staging_evidence_missing` |
| `20260901140943` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260901140943-other.json` | `staging_evidence_missing` |
| `20260901165511` | `other` | `repair_only` | Complete | `docs/staging-evidence/20260901165511-other.json` | None |
| `20260901170254` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260901170254-other.json` | `staging_evidence_missing` |
| `20260901170909` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260901170909-other.json` | `staging_evidence_missing` |
| `20260901174924` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260901174924-other.json` | `staging_evidence_missing` |
| `20260902095249` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260902095249-other.json` | `staging_evidence_missing` |
| `20260902105303` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260902105303-other.json` | `staging_evidence_missing` |
| `20260903094624` | `other` | `repair_only` | Complete | `docs/staging-evidence/20260903094624-other.json` | None |
| `20260903130012` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260903130012-other.json` | `staging_evidence_missing` |
| `20260905090353` | `other` | `repair_only` | Complete | `docs/staging-evidence/20260905090353-other.json` | None |
| `20260905091122` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260905091122-other.json` | `staging_evidence_missing` |
| `20260905095152` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260905095152-other.json` | `staging_evidence_missing` |
| `20260905141005` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260905141005-other.json` | `staging_evidence_missing` |
| `20260905141007` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260905141007-other.json` | `staging_evidence_missing` |
| `20260905141008` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260905141008-other.json` | `staging_evidence_missing` |
| `20260905141009` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260905141009-other.json` | `staging_evidence_missing` |
| `20260905141010` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260905141010-other.json` | `staging_evidence_missing` |
| `20260905141011` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260905141011-other.json` | `staging_evidence_missing` |
| `20260905141012` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260905141012-other.json` | `staging_evidence_missing` |
| `20260905141013` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260905141013-other.json` | `staging_evidence_missing` |
| `20260905141014` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260905141014-other.json` | `staging_evidence_missing` |
| `20260905141015` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260905141015-other.json` | `staging_evidence_missing` |
| `20260905141016` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260905141016-other.json` | `staging_evidence_missing` |
| `20260905141017` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260905141017-other.json` | `staging_evidence_missing` |
| `20260905141018` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260905141018-other.json` | `staging_evidence_missing` |
| `20260905141019` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260905141019-other.json` | `staging_evidence_missing` |
| `20260905141020` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260905141020-other.json` | `staging_evidence_missing` |
| `20260905141021` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260905141021-other.json` | `staging_evidence_missing` |
| `20260905150420` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260905150420-other.json` | `staging_evidence_missing` |
| `20260906063435` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260906063435-other.json` | `staging_evidence_missing` |
| `20260906065759` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260906065759-other.json` | `staging_evidence_missing` |
| `20260906070515` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260906070515-other.json` | `staging_evidence_missing` |
| `20260906071644` | `other` | `apply_original` | Pending | `docs/staging-evidence/20260906071644-other.json` | `staging_evidence_missing` |
| `20260906123000` | `other` | `repair_only` | Complete | `docs/staging-evidence/20260906123000-other.json` | None |
| `20260906130000` | `other` | `repair_only` | Pending | `docs/staging-evidence/20260906130000-other.json` | `staging_evidence_missing` |
| `20260906133000` | `other` | `repair_only` | Complete | `docs/staging-evidence/20260906133000-other.json` | None |
| `20260906134500` | `other` | `repair_only` | Complete | `docs/staging-evidence/20260906134500-other.json` | None |
| `20260906140000` | `other` | `repair_only` | Complete | `docs/staging-evidence/20260906140000-other.json` | None |

## Environment Blockers

- None

## Phase 1 Receipt Blockers

- None
