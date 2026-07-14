# Supabase Phase 0 Production Evidence

Generated: 2026-07-14T20:18:32.489Z

This is a read-only production baseline. It contains migration-ledger entries and catalog fingerprints only. It contains no application table data and no function bodies.

## Source

| Field | Value |
| --- | --- |
| Git branch | codex/db-phase0-reconciliation |
| Git commit | 6a758a76e2cf10674e686117683ccf4f4d3af141 |
| Migration rows | 376 |
| CLI local-only display rows | 103 |
| CLI remote-only display rows | 17 |
| Normalized matched versions | 273 |
| Normalized local-only versions | 86 |
| Normalized remote-only versions | 0 |
| Catalog objects | 11954 |

## Catalog counts

- constraint: 1963
- extension: 5
- function: 412
- grant: 6909
- index: 1399
- policy: 743
- storage_bucket: 3
- table: 330
- trigger: 190

## Integrity hashes

- Catalog snapshot SHA-256: `8c653e23ebb849175beccf5554a341ab83f5755a594f3a25bfb442fa5742a9cd`
- Ledger snapshot SHA-256: `27bb9db0200bd88acb14461f0779e489c3ada954882517430a6f8ef8c091ac0c`

## Files

- `docs/database-evidence/phase0-production-catalog.json`
- `docs/database-evidence/phase0-production-ledger.json`

The two-sided CLI display rows caused by adjacent long timestamps are normalized by the Phase 5 audit. They do not require migration-history repair when the same version exists in both the complete local and remote version sets.
