# Supabase Phase 0 Production Evidence

Generated: 2026-07-14T20:35:59.070Z

This is a read-only production baseline. It contains migration-ledger entries and catalog fingerprints only. It contains no application table data and no function bodies.

## Source

| Field | Value |
| --- | --- |
| Git branch | codex/db-phase0-reconciliation |
| Git commit | 80510b950aea5836c8f4dfb33ea5a98d7df935ab |
| Migration rows | 375 |
| CLI local-only display rows | 67 |
| CLI remote-only display rows | 17 |
| Normalized matched versions | 308 |
| Normalized local-only versions | 50 |
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

- Catalog snapshot SHA-256: `8e6b16c726a984a94560fe6db8fb65901227a53ee308fd8cc8b3c0b7452adf38`
- Ledger snapshot SHA-256: `a7e8645dd3a56889ad8393b9e89cbd774b6348c60f4b3e615f681c682d8ab4db`

## Files

- `docs/database-evidence/phase0-production-catalog.json`
- `docs/database-evidence/phase0-production-ledger.json`

The two-sided CLI display rows caused by adjacent long timestamps are normalized by the Phase 5 audit. They do not require migration-history repair when the same version exists in both the complete local and remote version sets.
