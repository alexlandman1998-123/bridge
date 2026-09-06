# Supabase Push Non-Runnable Clearance Report

Generated: 2026-09-06T16:39:57.076Z

## Scope

This step clears the non-runnable manifest rows into explicit review packets. It runs read-only live checks when requested and does not apply SQL, record ledgers, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Non-runnable rows | 23 |
| Corrective packets | 11 |
| Manual review packets | 12 |
| Rows with a runnable clearance decision | 23 |
| Rows ready for runner after clearance | 23 |
| Rows still requiring corrective SQL | 0 |
| Live verification performed | Yes |

## Work Queue

| Version | Stream | Original Action | Clearance Decision | Objects Live | Blockers | Packet |
| --- | --- | --- | --- | --- | --- | --- |
| `20260905101931` | `bond_finance_runtime` | `corrective_migration_required` | `apply_corrective_after_dependency_check` | 1/11 | None | `docs/corrective-migration-packets/20260905101931-bond_finance_runtime.md` |
| `202608200001` | `other` | `corrective_migration_required` | `apply_corrective_after_dependency_check` | 2/20 | None | `docs/corrective-migration-packets/202608200001-other.md` |
| `202608200002` | `other` | `manual_data_review` | `apply_original_after_dependency_check` | 0/0 | None | `docs/manual-review/202608200002-other.md` |
| `20260820174624` | `other` | `manual_data_review` | `apply_original_after_dependency_check` | 0/0 | None | `docs/manual-review/20260820174624-other.md` |
| `20260820192038` | `other` | `manual_data_review` | `apply_original_after_dependency_check` | 0/0 | None | `docs/manual-review/20260820192038-other.md` |
| `20260820192857` | `other` | `manual_data_review` | `apply_original_after_dependency_check` | 0/0 | None | `docs/manual-review/20260820192857-other.md` |
| `202608230001` | `other` | `corrective_migration_required` | `apply_corrective_after_dependency_check` | 1/15 | None | `docs/corrective-migration-packets/202608230001-other.md` |
| `20260824084233` | `other` | `manual_data_review` | `apply_original_after_dependency_check` | 0/0 | None | `docs/manual-review/20260824084233-other.md` |
| `20260824092531` | `other` | `manual_data_review` | `apply_original_after_dependency_check` | 0/0 | None | `docs/manual-review/20260824092531-other.md` |
| `202608250001` | `other` | `manual_data_review` | `apply_original_after_dependency_check` | 0/0 | None | `docs/manual-review/202608250001-other.md` |
| `20260827083108` | `other` | `corrective_migration_required` | `apply_corrective_after_dependency_check` | 1/3 | None | `docs/corrective-migration-packets/20260827083108-other.md` |
| `20260829204153` | `other` | `corrective_migration_required` | `apply_corrective_after_dependency_check` | 1/3 | None | `docs/corrective-migration-packets/20260829204153-other.md` |
| `20260830160810` | `other` | `manual_data_review` | `apply_original_after_dependency_check` | 0/0 | None | `docs/manual-review/20260830160810-other.md` |
| `20260831131538` | `other` | `manual_data_review` | `apply_original_after_dependency_check` | 0/0 | None | `docs/manual-review/20260831131538-other.md` |
| `20260831153322` | `other` | `manual_data_review` | `apply_original_after_dependency_check` | 0/0 | None | `docs/manual-review/20260831153322-other.md` |
| `20260901075131` | `other` | `corrective_migration_required` | `apply_corrective_after_dependency_check` | 10/11 | None | `docs/corrective-migration-packets/20260901075131-other.md` |
| `20260901110612` | `other` | `corrective_migration_required` | `apply_corrective_after_dependency_check` | 9/22 | None | `docs/corrective-migration-packets/20260901110612-other.md` |
| `20260901143358` | `other` | `manual_data_review` | `apply_original_after_dependency_check` | 0/0 | None | `docs/manual-review/20260901143358-other.md` |
| `20260901145225` | `other` | `manual_data_review` | `apply_original_after_dependency_check` | 0/0 | None | `docs/manual-review/20260901145225-other.md` |
| `20260903122031` | `other` | `corrective_migration_required` | `apply_corrective_after_dependency_check` | 4/34 | None | `docs/corrective-migration-packets/20260903122031-other.md` |
| `20260905120250` | `other` | `corrective_migration_required` | `apply_corrective_after_dependency_check` | 3/11 | None | `docs/corrective-migration-packets/20260905120250-other.md` |
| `20260905125639` | `other` | `corrective_migration_required` | `apply_corrective_after_dependency_check` | 1/2 | None | `docs/corrective-migration-packets/20260905125639-other.md` |
| `20260906070938` | `other` | `corrective_migration_required` | `apply_corrective_after_dependency_check` | 1/7 | None | `docs/corrective-migration-packets/20260906070938-other.md` |

## Rule

Partial-live rows remain blocked until a reviewed corrective migration exists. Manual data rows can be routed only after the live data outcome and idempotency checks are recorded in the packet.
