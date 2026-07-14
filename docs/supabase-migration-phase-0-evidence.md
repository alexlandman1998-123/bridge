# Supabase Phase 0 Production Evidence

Generated: 2026-07-14T20:45:27.428Z

This is a read-only production baseline. It contains migration-ledger entries and catalog fingerprints only. It contains no application table data and no function bodies.

## Source

| Field | Value |
| --- | --- |
| Git branch | codex/db-phase0-reconciliation |
| Git commit | 5234e3194ef791be3410d5e598ec6b2718dba457 |
| Migration rows | 375 |
| CLI local-only display rows | 60 |
| CLI remote-only display rows | 17 |
| Normalized matched versions | 315 |
| Normalized local-only versions | 43 |
| Normalized remote-only versions | 0 |
| Catalog objects | 11949 |

## Catalog counts

- constraint: 1970
- extension: 5
- function: 413
- grant: 6909
- index: 1403
- policy: 726
- storage_bucket: 3
- table: 330
- trigger: 190

## Integrity hashes

- Catalog snapshot SHA-256: `e2c5cc9566697ba030a0fd440cde58a8bd8f6cf36e4f2a00b1b3a268959c60c6`
- Ledger snapshot SHA-256: `cb116143349577da2bc83478fd954147bc80f8ceda2fdf0d880cb318ed1cb31d`

## Files

- `docs/database-evidence/phase0-production-catalog.json`
- `docs/database-evidence/phase0-production-ledger.json`

The two-sided CLI display rows caused by adjacent long timestamps are normalized by the Phase 5 audit. They do not require migration-history repair when the same version exists in both the complete local and remote version sets.
