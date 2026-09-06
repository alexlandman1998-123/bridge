# Agent scale Phase 6 — controlled release readiness

Phase 6 upgrades the existing deterministic release decision for scale. It remains read-only: it cannot deploy, apply migrations, seed accounts, change flags, or modify the central API module.

The gate returns `GO` only when all of the following evidence is no more than 72 hours old:

- Phase 1/2 RLS acceptance passes for all six required actor profiles and the required migration.
- Every required performance surface, now including Calendar, has at least 20 cold and 20 warm samples for core-ready and settled checkpoints.
- Calendar settled p95 stays within request, duplicate-request, slow-request, and transferred-byte budgets.
- Agent, principal, and branch-manager browser reports each contain a ready Calendar result with no technical errors, failed requests, overflow, unnamed controls, or keyboard-focus failure.

The generated receipt records SHA-256 fingerprints for the config and every evidence file. This makes later pilot approval traceable to the exact evidence reviewed.

Run `npm run verify:agent-scale-phase6` for source verification, then `npm run check:agent-phase6-release` after fresh staging evidence has been collected. Missing, stale, undersampled, or breached evidence produces `HOLD` and a non-zero exit code.
