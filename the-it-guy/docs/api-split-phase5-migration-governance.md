# Phase 5 — Forward-Only Migration Governance

The legacy production ledger is evidence, not a deployment source. Once Phase 2 passes, generate exactly one reviewed clean baseline migration from the verified schema and test it against an empty rehearsal project. Every later schema change is a new reviewed migration applied to replacement staging first.

Run the gate:

```bash
node the-it-guy/scripts/verify-clean-baseline-migration-governance.mjs --strict
```

The gate intentionally fails until schema equivalence is verified. It never calls `migration repair` or changes a remote project.
