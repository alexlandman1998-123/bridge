# Phase 8 — Controlled Production Cutover

This phase only prepares the decision gate. It does not deploy or alter production.

```bash
node the-it-guy/scripts/verify-production-cutover-readiness.mjs --strict
```

The gate requires verified schema equivalence, a completed replacement-staging release train, separately recorded human approval, a change window, a short schema freeze, and a tested rollback path. The legacy staging database is never a cutover source.
