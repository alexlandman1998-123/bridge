# Rentals release readiness — Phase 8 staging rebuild gate

Phase 8 prepares a controlled staging rebuild but does not apply it. The gate is read-only:

```sh
node scripts/rentals-release-phase8-staging-rebuild-gate.mjs
```

It requires a locked source baseline, a successful local-verification receipt for the same chain digest, and one approved staging target in [`config/rentals-release-staging-rebuild-target.json`](../config/rentals-release-staging-rebuild-target.json).

The target must be either a new non-production project (`fresh`) or the existing staging project only when it is explicitly confirmed disposable (`replace_disposable`). Production is rejected unconditionally, and outbound integrations must be frozen. A passing result merely allows a separate, explicit staging-apply decision.
