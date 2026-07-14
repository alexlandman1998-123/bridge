# Supabase Phase 0 Production Evidence

Generated: 2026-07-14T21:23:25.821Z

This is a read-only production baseline. It contains migration-ledger entries and catalog fingerprints only. It contains no application table data and no function bodies.

## Source

| Field | Value |
| --- | --- |
| Git branch | codex/db-phase0-reconciliation |
| Git commit | 789bf211cd7d8cbf90ff1e1ef500d979bf7d5a20 |
| Migration rows | 378 |
| CLI local-only display rows | 52 |
| CLI remote-only display rows | 17 |
| Normalized matched versions | 326 |
| Normalized local-only versions | 35 |
| Normalized remote-only versions | 0 |
| Catalog objects | 12110 |

## Catalog counts

- constraint: 2005
- extension: 5
- function: 438
- grant: 6965
- index: 1422
- policy: 744
- storage_bucket: 4
- table: 334
- trigger: 193

## Integrity hashes

- Catalog snapshot SHA-256: `ef5281b9bab5c9818fd3a7ebbfbf4735923be7a54170958d1162c1ddf2b7050e`
- Ledger snapshot SHA-256: `e396a9600b5f1b6970ab853562cd0fb9036826fd9f30a8069bddd4a6b6f491cc`

## Files

- `docs/database-evidence/phase0-production-catalog.json`
- `docs/database-evidence/phase0-production-ledger.json`

The two-sided CLI display rows caused by adjacent long timestamps are normalized by the Phase 5 audit. They do not require migration-history repair when the same version exists in both the complete local and remote version sets.
