# Arch9 MVP — Phase 8 scale to 100 transactions/month

Scale only after a clean completed production batch audit. The capacity ladder is fixed:

```text
10 → 25 → 50 → 100 transactions/month
```

At every level, record production-only, non-secret rollout evidence: the current capacity, completed passing batch-audit count, and transaction-level idempotency/bootstrap results. Then run:

```bash
npm run mvp:phase8:scale -- --input=docs/production-rollout-evidence.json
```

The check pauses the rollout on a duplicate identity, bootstrap failure, capacity breach, invalid capacity level, or missing completed batch audit. A passing level returns either the next allowed capacity or `maintain_mvp_capacity` at 100/month.

Do not add product scope while scaling. Fix recurring operational friction before increasing the capacity level.
