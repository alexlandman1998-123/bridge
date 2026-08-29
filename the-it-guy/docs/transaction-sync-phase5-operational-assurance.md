# Transaction sync Phase 5: operational assurance

Phase 5 adds a read-only operational release gate over the canonical transaction synchronization path. It does not repair, replay, or fabricate transaction history.

## What the audit proves

For every inspected active transaction, the audit checks:

- all 29 frozen Phase 0 action definitions are deployed;
- the canonical rollup and at least one lane exist;
- every inspected command receipt reached `projected`;
- all six durable output references are present on the receipt;
- the referenced canonical event and activity projection exist;
- the projection queue receipt is completed;
- the refresh watermark is at least the latest command version and identifies the latest receipt;
- end-to-end command completion meets the two-second propagation target; and
- the receipt window was not truncated.

Transactions that have never exercised the canonical command path are warnings, not silently certified. Missing data, stuck receipts, failed projections, incomplete output references, and refresh-version drift are critical.

## Release rule

The fleet is `releaseReady` only when at least one transaction was inspected and every inspected transaction is healthy, with no warnings, critical findings, or query failures.

The auditor is deliberately read-only. A critical finding blocks rollout and preserves evidence for diagnosis. Phase 1 remains the controlled spine repair; source-domain commands must be retried through their owning module rather than reconstructed by a monitoring job.

## Running the audit

```bash
npm run audit:transaction-sync-phase5 -- --environment=staging --require-project-ref=<project-ref>
```

Narrow checks can add `--transaction-id=<uuid>`. The CLI requires an explicit environment and accepts an exact project-ref guard. It prints JSON and exits non-zero unless the inspected scope is release-ready.

No remote migration or database write is part of Phase 5.

