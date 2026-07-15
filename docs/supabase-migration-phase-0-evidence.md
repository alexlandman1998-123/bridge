# Supabase Phase 0 Production Evidence

Generated: 2026-07-14T22:02:11.009Z

This is a read-only production baseline. It contains migration-ledger entries and catalog fingerprints only. It contains no application table data and no function bodies.

## Source

| Field | Value |
| --- | --- |
| Git branch | codex/db-phase0-reconciliation |
| Git commit | 83bbecbeceb9f5dca4628d241b3bca93b3d3d08a |
| Migration rows | 381 |
| CLI local-only display rows | 28 |
| CLI remote-only display rows | 17 |
| Normalized matched versions | 353 |
| Normalized local-only versions | 11 |
| Normalized remote-only versions | 0 |
| Catalog objects | 12624 |

## Catalog counts

- constraint: 2138
- extension: 5
- function: 461
- grant: 7189
- index: 1502
- policy: 775
- storage_bucket: 4
- table: 350
- trigger: 200

## Integrity hashes

- Catalog snapshot SHA-256: `383a286471ce24a5288c5ba57f07fe2566b4fdc3e01659619f345fd67d405924`
- Ledger snapshot SHA-256: `475579c2f8fc41e4c9ca0c5cfeb2893c569ba260a3e3f5aaa4dcfb97300653dc`

## Files

- `docs/database-evidence/phase0-production-catalog.json`
- `docs/database-evidence/phase0-production-ledger.json`

The two-sided CLI display rows caused by adjacent long timestamps are normalized by the Phase 5 audit. They do not require migration-history repair when the same version exists in both the complete local and remote version sets.
