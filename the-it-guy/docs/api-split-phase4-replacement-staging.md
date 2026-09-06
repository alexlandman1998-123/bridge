# Phase 4 — Replacement Staging

The only candidate is the isolated rehearsal project, never the legacy staging project. Its configuration is intentionally test-data-only and blocks production traffic.

The activation gate is read-only:

```bash
node the-it-guy/scripts/verify-replacement-staging-readiness.mjs --strict
```

It cannot pass until Phase 2 marks schema equivalence verified and Phase 3 configuration review is complete. At that point, configure a separate staging application deployment with only the named environment variables; do not reuse production credentials or routes.
