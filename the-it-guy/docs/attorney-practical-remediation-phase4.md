# Attorney practical release — Phase 4 remediation and regression

Phase 4 consolidates defects recorded by workflow, propagation, and UI evidence. Every defect needs an owner, disposition, and evidence. P0/P1 defects require a fix reference, closed status, and successful retest; P2 issues must be closed or explicitly accepted; P3 issues must be closed, accepted, or backlogged.

The gate then requires workflow, propagation, UI, and attorney regression suites plus all six role/device walkthroughs against a recorded staging deployment and code revision. New or reopened P0/P1 defects fail the phase.

Run `npm run check:attorney-practical-phase4`. `BLOCKED` means one of Phases 1–3 or its exact evidence has not passed. `READY_TO_RUN` permits final staging regression. Only `PASSED` completes Phase 4. The checker does not apply fixes, mutate databases, deploy code, or touch production.
