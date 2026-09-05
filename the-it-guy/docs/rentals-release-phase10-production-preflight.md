# Rentals release readiness — Phase 10 production preflight

Phase 10 is a no-apply production preflight:

```sh
node scripts/rentals-release-phase10-production-preflight.mjs
```

The approved record in [`config/rentals-release-production-preflight.json`](../config/rentals-release-production-preflight.json) must bind one immutable release commit, the exact locked source digest, canonical production project, staging certification, deployment freeze, and a rollback reference. The preflight reruns only local Git identity checks and refuses a dirty worktree.

A pass is not production deployment authority. It is the input to the separate controlled release decision in Phase 11.
