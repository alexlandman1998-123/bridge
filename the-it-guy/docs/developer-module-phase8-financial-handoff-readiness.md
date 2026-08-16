# Developer Module Phase 8 Financial Handoff Readiness

Phase 8 adds a practical handoff-readiness layer to the developer financial
roll-up. It tells operators whether reservation deposit and alteration cost data
is clean enough to hand to accounts, conveyancers, and the developer team.

## Scope

- Count critical reservation deposit gaps before handoff.
- Count follow-up reservation deposit gaps before handoff.
- Count critical alteration costing gaps before handoff.
- Count follow-up alteration costing gaps before handoff.
- Surface a clear status: **Ready for handoff**, **Ready with follow-up**, or
  **Needs cleanup**.
- Add control review rows to the Phase 7 financial reconciliation export.

## Readiness Rules

Critical gaps should block clean handoff:

- reservation amount missing;
- reservation treatment missing;
- billable alteration amount missing.

Follow-up gaps should be visible but may not block handoff:

- deposit recipient missing;
- deposit proof outstanding;
- alteration treatment defaulted;
- alteration decision pending.

## Operator Outcome

The developer overview exposes **Handoff Readiness** inside the financial
roll-up. The panel gives operators a fast decision: proceed, proceed with
follow-up, or clean up the file before sending the financial position onward.

The reconciliation CSV also includes **Control Review** rows so the same issues
travel with the export.

## Verification

Run the Phase 8 contract directly:

```bash
npm run test:developer-module-phase8
```

Run the full developer module chain:

```bash
npm run verify:developer-module
```
