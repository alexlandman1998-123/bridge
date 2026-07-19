# Arch9 MVP — Phase 8 scale to 100 transactions/month

Scale only after a clean completed production batch audit. The capacity ladder is fixed:

```text
10 → 25 → 50 → 100 transactions/month
```

At every level, record production-only, non-secret rollout evidence: the current capacity, reporting month, complete monthly transaction-reference ledger and count, completed passing batch-audit count, clean pilot closeouts, transaction-level idempotency/bootstrap results, and explicit approval for the next MVP capacity. Then run:

```bash
npm run mvp:phase8:scale -- --input=docs/production-rollout-evidence.json
```

The check pauses the rollout on a duplicate identity, bootstrap failure, pilot incident, capacity breach, invalid capacity level, missing or inconsistent monthly ledger, missing completed batch audit, missing clean closeout, or missing scale approval. At 100/month it additionally requires a capacity-maintenance review: no new product scope, zero recurring operational blockers, and explicit approval to keep the 100/month ceiling. A passing level returns either the next allowed capacity or `maintain_mvp_capacity` at 100/month.

Do not add product scope while scaling. Fix recurring operational friction before increasing the capacity level.
