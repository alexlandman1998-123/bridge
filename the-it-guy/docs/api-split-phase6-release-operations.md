# Phase 6 — Release Operations

Each release train starts as the checked-in template and must collect evidence in this order: review, replacement-staging migration/application deployment, equivalence retest, API smoke tests, rollback review, production approval, and post-deploy verification.

```bash
node the-it-guy/scripts/verify-release-train.mjs --strict
```

The gate is intentionally blocked until the clean baseline is verified and a real reviewed release train replaces the template. It performs no deployment or database write.
