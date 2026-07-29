# Supabase Push Staging Evidence Completion Report

Generated: 2026-07-29T19:42:46.480Z

## Scope

This gate validates completion readiness for the current runner-eligible staging rows. It does not apply SQL, record staging ledgers, relink Supabase, or invent evidence.

## Summary

| Field | Value |
| --- | --- |
| Runner-eligible rows | 32 |
| Complete staging evidence rows | 0 |
| Pending staging evidence rows | 32 |
| Staging environment configured | No |
| Phase 1 receipt ready | Yes |

## Route Summary

| Route | Rows |
| --- | --- |
| `apply_original` | 26 |
| `repair_only` | 6 |

## Blocker Counts

| Blocker | Rows |
| --- | --- |
| `staging_db_url_env_missing` | 32 |
| `staging_evidence_missing` | 32 |
| `staging_project_ref_env_missing` | 32 |
| `staging_recovery_confirmation_missing` | 32 |

## Work Queue

| Version | Stream | Route | Status | Evidence | Blockers |
| --- | --- | --- | --- | --- | --- |
| `202607270013` | `legal_document_runtime` | `repair_only` | Pending | `docs/staging-evidence/202607270013-legal_document_runtime.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607270015` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/202607270015-bond_finance_runtime.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280003` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/202607280003-bond_finance_runtime.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280004` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/202607280004-bond_finance_runtime.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280005` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/202607280005-bond_finance_runtime.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280006` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/202607280006-bond_finance_runtime.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280007` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/202607280007-bond_finance_runtime.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280008` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/202607280008-bond_finance_runtime.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280009` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/202607280009-bond_finance_runtime.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280010` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/202607280010-bond_finance_runtime.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280011` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/202607280011-bond_finance_runtime.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280012` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/202607280012-bond_finance_runtime.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280013` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/202607280013-bond_finance_runtime.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280014` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/202607280014-bond_finance_runtime.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280015` | `bond_finance_runtime` | `apply_original` | Pending | `docs/staging-evidence/202607280015-bond_finance_runtime.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607260008` | `other` | `repair_only` | Pending | `docs/staging-evidence/202607260008-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607270002` | `other` | `repair_only` | Pending | `docs/staging-evidence/202607270002-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607270009` | `other` | `repair_only` | Pending | `docs/staging-evidence/202607270009-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607270010` | `other` | `repair_only` | Pending | `docs/staging-evidence/202607270010-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607270011` | `other` | `apply_original` | Pending | `docs/staging-evidence/202607270011-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607290005` | `other` | `apply_original` | Pending | `docs/staging-evidence/202607290005-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607270014` | `other` | `repair_only` | Pending | `docs/staging-evidence/202607270014-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280002` | `other` | `apply_original` | Pending | `docs/staging-evidence/202607280002-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280016` | `other` | `apply_original` | Pending | `docs/staging-evidence/202607280016-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280017` | `other` | `apply_original` | Pending | `docs/staging-evidence/202607280017-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280018` | `other` | `apply_original` | Pending | `docs/staging-evidence/202607280018-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280019` | `other` | `apply_original` | Pending | `docs/staging-evidence/202607280019-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280020` | `other` | `apply_original` | Pending | `docs/staging-evidence/202607280020-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280021` | `other` | `apply_original` | Pending | `docs/staging-evidence/202607280021-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280022` | `other` | `apply_original` | Pending | `docs/staging-evidence/202607280022-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280023` | `other` | `apply_original` | Pending | `docs/staging-evidence/202607280023-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |
| `202607280024` | `other` | `apply_original` | Pending | `docs/staging-evidence/202607280024-other.json` | `staging_project_ref_env_missing`<br>`staging_db_url_env_missing`<br>`staging_recovery_confirmation_missing`<br>`staging_evidence_missing` |

## Environment Blockers

- `staging_project_ref_env_missing`
- `staging_db_url_env_missing`
- `staging_recovery_confirmation_missing`

## Phase 1 Receipt Blockers

- None
