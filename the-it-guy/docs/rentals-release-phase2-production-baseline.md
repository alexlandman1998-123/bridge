# Rentals release readiness — Phase 2 production baseline

Phase 2 requires authoritative, read-only production evidence for `isdowlnollckzvltkasn`. It reads the redacted evidence record and does not connect to, query, or mutate production itself.

```sh
node scripts/rentals-release-phase2-production-baseline.mjs
```

The production ledger record must identify a read-only `migration_ledger` artifact. The production catalog record must be read-only and cover all six object groups: tables, functions, policies, triggers, indexes, and storage. Both records need opaque references, timestamps, and SHA-256 fingerprints, and must explicitly contain neither secrets nor customer rows.

A passing Phase 2 proves only that the production baseline was captured. It does not approve a migration, reset, repair, or deployment.
