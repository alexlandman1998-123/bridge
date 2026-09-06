# Attorney practical release — Phase 0 acceptance bar

## Outcome

Phase 0 defines one machine-checkable acceptance matrix for practical attorney UAT. It is deliberately separate from the earlier staging environment-safety phase.

The contract fixes:

- transfer, bond, and cancellation attorney roles;
- five representative actions per role;
- desktop and mobile walkthroughs;
- all six propagation destinations;
- internal, professional-shared, and client-visible boundaries;
- P0–P3 defect treatment;
- authenticated browser, screenshot or trace, action-receipt, and destination evidence;
- a 24-hour staging soak with 30 actions, at least five per role, 99% success, p95 no higher than 120 seconds, and zero propagation or safety incidents.

## Gate

Run:

```bash
npm run check:attorney-practical-phase0
```

The initial result is expected to be `READY_FOR_APPROVAL`. Copy `docs/attorney-practical-phase0-approval.example.json` into the private output directory and approve the exact contract fingerprint. Then rerun:

```bash
npm run check:attorney-practical-phase0 -- --approval=output/attorney-release/practical-phase0-approval.json
```

Only `ACCEPTED` permits practical browser UAT to begin. Phase 0 is read-only and does not change staging or production data.
