# Supabase Phase 0 Production Evidence

Generated: 2026-07-14T21:43:13.930Z

This is a read-only production baseline. It contains migration-ledger entries and catalog fingerprints only. It contains no application table data and no function bodies.

## Source

| Field | Value |
| --- | --- |
| Git branch | codex/db-phase0-reconciliation |
| Git commit | 92421f30f8c67fcaddf2eddc5c7608cac9c37c61 |
| Migration rows | 379 |
| CLI local-only display rows | 36 |
| CLI remote-only display rows | 17 |
| Normalized matched versions | 343 |
| Normalized local-only versions | 19 |
| Normalized remote-only versions | 0 |
| Catalog objects | 12329 |

## Catalog counts

- constraint: 2062
- extension: 5
- function: 450
- grant: 7063
- index: 1456
- policy: 753
- storage_bucket: 4
- table: 341
- trigger: 195

## Integrity hashes

- Catalog snapshot SHA-256: `a91bde1f3f81cfda33d172ee6d8d21da2008c089695a4738c7f8238fe6a95548`
- Ledger snapshot SHA-256: `6f9219f8ec526e22384ec43f9bb1d2314fdc39a3bb1ed4e15dccb8fdd64c6db2`

## Files

- `docs/database-evidence/phase0-production-catalog.json`
- `docs/database-evidence/phase0-production-ledger.json`

The two-sided CLI display rows caused by adjacent long timestamps are normalized by the Phase 5 audit. They do not require migration-history repair when the same version exists in both the complete local and remote version sets.
