# Rentals staging recovery — Phase 5 source lock

Phase 5 establishes an immutable-review input for the managed Rental foundation migration work. It reads the ordered source chain and emits a SHA-256 digest for each source plus a single ordered-chain digest. It does not write files, create a migration, connect to Supabase, or apply any schema change.

```sh
node scripts/rentals-staging-recovery-phase5-source-lock.mjs
```

The report is intentionally blocked until the Phase 4 evidence contract passes. When it passes, retain the report’s chain digest with the peer-review record and regenerate it immediately before authoring migrations. A changed file or source order produces a different lock and requires a fresh review.

`applyAllowed` remains `false` in every outcome. This phase is a source-review boundary, not a database-change authorisation.
