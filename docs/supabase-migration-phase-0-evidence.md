# Supabase Phase 0 Production Evidence

Generated: 2026-07-15T05:56:37.060Z

This is a read-only production baseline. It contains migration-ledger entries and catalog fingerprints only. It contains no application table data and no function bodies.

## Source

| Field | Value |
| --- | --- |
| Git branch | codex/db-phase0-reconciliation |
| Git commit | f55d264ae9f9aedfed8471956485c2ab5251ea04 |
| Migration rows | 382 |
| CLI local-only display rows | 22 |
| CLI remote-only display rows | 17 |
| Normalized matched versions | 360 |
| Normalized local-only versions | 5 |
| Normalized remote-only versions | 0 |
| Catalog objects | 12720 |

## Catalog counts

- constraint: 2164
- extension: 5
- function: 478
- grant: 7212
- index: 1519
- policy: 780
- storage_bucket: 4
- table: 353
- trigger: 205

## Integrity hashes

- Catalog snapshot SHA-256: `3cda1046642bb4df567476292294d25aa5bb1ababd26263ace2e472b6901452e`
- Ledger snapshot SHA-256: `5c279906aed61faa30583ba35223535e49cf78ed48270feb50abeee8d1801a54`

## Files

- `docs/database-evidence/phase0-production-catalog.json`
- `docs/database-evidence/phase0-production-ledger.json`

The two-sided CLI display rows caused by adjacent long timestamps are normalized by the Phase 5 audit. They do not require migration-history repair when the same version exists in both the complete local and remote version sets.
