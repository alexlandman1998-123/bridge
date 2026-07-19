# MVP controlled-pilot runbook

Run `node scripts/mvp-pilot-session-check.mjs` before each pilot batch. A green result permits at most ten new transactions in that batch; this keeps the initial 100-transaction monthly target observable and recoverable.

Stop accepting new pilot transactions immediately if certification fails, a duplicate creation identity appears, a created transaction lacks any bootstrap, or two module surfaces disagree about a gate.

For every stop condition, capture the transaction id and the error evidence, run `node scripts/mvp-release-certification.mjs`, reconcile the affected transaction before retrying, and record the resolution before the next batch.
