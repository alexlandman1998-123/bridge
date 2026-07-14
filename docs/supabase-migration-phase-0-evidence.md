# Supabase Phase 0 Production Evidence

Generated: 2026-07-14T21:01:28.443Z

This is a read-only production baseline. It contains migration-ledger entries and catalog fingerprints only. It contains no application table data and no function bodies.

## Source

| Field | Value |
| --- | --- |
| Git branch | codex/db-phase0-reconciliation |
| Git commit | 7c5e22ea3b6c8e7f4bbb160b779b3fda7f4053e0 |
| Migration rows | 376 |
| CLI local-only display rows | 55 |
| CLI remote-only display rows | 17 |
| Normalized matched versions | 321 |
| Normalized local-only versions | 38 |
| Normalized remote-only versions | 0 |
| Catalog objects | 12005 |

## Catalog counts

- constraint: 1980
- extension: 5
- function: 434
- grant: 6923
- index: 1412
- policy: 726
- storage_bucket: 3
- table: 332
- trigger: 190

## Integrity hashes

- Catalog snapshot SHA-256: `41325b7684fdd8c897d62c6755723a3e0ad72e5ca58b9e9e6c4ca4466766574f`
- Ledger snapshot SHA-256: `4632cf728033af3c0f9d7754675f97c1eeb2cfe0de7706f75bf5f28edac8390e`

## Files

- `docs/database-evidence/phase0-production-catalog.json`
- `docs/database-evidence/phase0-production-ledger.json`

The two-sided CLI display rows caused by adjacent long timestamps are normalized by the Phase 5 audit. They do not require migration-history repair when the same version exists in both the complete local and remote version sets.
