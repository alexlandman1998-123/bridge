# Supabase Push Non-Runnable Clearance Report

Generated: 2026-07-25T17:01:36.100Z

## Scope

This step clears the five non-runnable manifest rows into explicit review packets. It runs read-only live checks when requested and does not apply SQL, record ledgers, relink Supabase, or modify production.

## Summary

| Field | Value |
| --- | --- |
| Non-runnable rows | 5 |
| Corrective packets | 4 |
| Manual review packets | 1 |
| Rows with a runnable clearance decision | 5 |
| Rows ready for runner after clearance | 5 |
| Rows still requiring corrective SQL | 0 |
| Live verification performed | Yes |

## Work Queue

| Version | Stream | Original Action | Clearance Decision | Objects Live | Blockers | Packet |
| --- | --- | --- | --- | --- | --- | --- |
| `202607220004` | `legal_document_runtime` | `corrective_migration_required` | `apply_corrective_after_dependency_check` | 3/11 | None | `docs/corrective-migration-packets/202607220004-legal_document_runtime.md` |
| `202607220006` | `legal_document_runtime` | `corrective_migration_required` | `apply_corrective_after_dependency_check` | 2/5 | None | `docs/corrective-migration-packets/202607220006-legal_document_runtime.md` |
| `202607220007` | `legal_document_runtime` | `corrective_migration_required` | `apply_corrective_after_dependency_check` | 3/4 | None | `docs/corrective-migration-packets/202607220007-legal_document_runtime.md` |
| `202607240002` | `legal_document_runtime` | `manual_data_review` | `apply_original_after_dependency_check` | 0/0 | None | `docs/manual-review/202607240002-legal_document_runtime.md` |
| `202607230001` | `seller_transaction_continuity` | `corrective_migration_required` | `apply_corrective_after_dependency_check` | 2/17 | None | `docs/corrective-migration-packets/202607230001-seller_transaction_continuity.md` |

## Rule

Partial-live rows remain blocked until a reviewed corrective migration exists. Manual data rows can be routed only after the live data outcome and idempotency checks are recorded in the packet.
