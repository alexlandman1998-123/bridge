# Rentals release readiness — Phase 3 evidence clearance

Phase 3 combines the preceding authorities into one no-apply release-evidence decision:

```sh
node scripts/rentals-release-phase3-evidence-clearance.mjs
```

It passes only if both are green:

1. Phase 1 staging recovery authority: confirmed snapshot/disposability position and a separate operations freeze; and
2. Phase 2 production baseline authority: a redacted, read-only, complete ledger and Rentals catalog capture.

A pass permits only managed migration **authoring**. It does not approve a database migration, schema reset, ledger repair, application deployment, or production release.
