# Supabase Phase 0 Production Evidence

Generated: 2026-07-14T20:25:32.999Z

This is a read-only production baseline. It contains migration-ledger entries and catalog fingerprints only. It contains no application table data and no function bodies.

## Source

| Field | Value |
| --- | --- |
| Git branch | codex/db-phase0-reconciliation |
| Git commit | 6b1ae05b574f2f0ae2efdb2313e4382d3bc025b0 |
| Migration rows | 375 |
| CLI local-only display rows | 101 |
| CLI remote-only display rows | 17 |
| Normalized matched versions | 274 |
| Normalized local-only versions | 84 |
| Normalized remote-only versions | 0 |
| Catalog objects | 11934 |

## Catalog counts

- constraint: 1963
- extension: 5
- function: 413
- grant: 6909
- index: 1399
- policy: 722
- storage_bucket: 3
- table: 330
- trigger: 190

## Integrity hashes

- Catalog snapshot SHA-256: `e6f304ee210f71f72cbbdcf3f6e52f8a0cfcb61ee38dbf7b65de064863b6aef9`
- Ledger snapshot SHA-256: `ef7d45f356c75667a4595fb745aae2bde76a449241cb6c9a7d11f26f98c59e04`

## Files

- `docs/database-evidence/phase0-production-catalog.json`
- `docs/database-evidence/phase0-production-ledger.json`

The two-sided CLI display rows caused by adjacent long timestamps are normalized by the Phase 5 audit. They do not require migration-history repair when the same version exists in both the complete local and remote version sets.
