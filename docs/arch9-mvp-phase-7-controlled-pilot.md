# Arch9 MVP — Phase 7 controlled production pilot

Phase 7 starts only after Phase 6 returns `ready_for_controlled_production_pilot`. It does not increase the MVP capacity target; it makes the first production activity observable and recoverable.

## Before each batch

Run the pilot session check using the same evidence passed to Phase 6:

```bash
npm run mvp:phase7:session -- \
  --staging-ledger=docs/staging-migration-ledger.json \
  --deployment-evidence=/secure-local-path/staging-deployment-evidence.json \
  --rollback-evidence=/secure-local-path/staging-rollback-evidence.json \
  --journey-evidence=docs/staging-mvp-journeys.json \
  --review-evidence=docs/staging-mvp-review.json \
  --decision-evidence=docs/production-pilot-decision.json \
  --support-evidence=/secure-local-path/production-pilot-support-evidence.json \
  --session-evidence=/secure-local-path/production-pilot-session-01.json
```

The session evidence must be prepared by the approved pilot owner, list unique non-secret planned transaction references, nominate the approved stop authority, and contain no more than ten references. Only `go_for_batch_of_10` permits the next batch. Do not create more than ten production transactions in the batch.

## After each batch

Create non-secret batch evidence with every transaction id, idempotency key, bootstrap result, post-deploy smoke result, and gate-consistency result. Audit it:

```bash
npm run mvp:phase7:audit -- \
  --input=/secure-local-path/production-pilot-batch-01.json \
  --session-evidence=/secure-local-path/production-pilot-session-01.json
```

Each batch transaction must include its declared `plannedTransactionReference`; the completed references must match the session charter exactly.

After a passing audit, the approved pilot owner must record batch closeout and the approved support owner must acknowledge it. A closeout can permit a new session check only when the audit has no issues, no stop condition was triggered, and `incidentCount` is zero:

```bash
npm run mvp:pilot:batch-closeout -- \
  --evidence=/secure-local-path/production-pilot-batch-01-closeout.json \
  --batch-audit=/secure-local-path/production-pilot-batch-01-audit.json \
  --session-evidence=/secure-local-path/production-pilot-session-01.json \
  --support-evidence=/secure-local-path/production-pilot-support-evidence.json
```

Any failure is a stop condition. Pause new production work, preserve transaction IDs and evidence, resolve the affected issue, re-run Phase 6, then start a new batch only after a new passing session check.
