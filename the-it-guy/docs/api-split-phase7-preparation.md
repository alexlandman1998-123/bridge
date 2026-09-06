# Phase 7 — API Split Preparation

Use the legacy API file as a compatibility facade. The extraction order starts with reporting and documents; transactions remain last because it is the highest-risk cross-domain area.

```bash
node the-it-guy/scripts/verify-api-split-readiness.mjs --strict
```

Each extraction is move-only, one domain per release train, protected by a feature flag and contract tests. No production flag is enabled by this phase.
