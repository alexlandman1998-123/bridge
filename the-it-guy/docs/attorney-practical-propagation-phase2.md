# Attorney practical release — Phase 2 propagation proof

## Outcome

Phase 2 traces every mutating Phase 1 action receipt through the modules allowed by that update's visibility. Navigation-only `open_assigned_matter` checks are excluded, leaving 24 persisted update sources from a complete Phase 1 run.

For each source, evidence must retain the receipt, matter, action, visibility and client recipients; prove matching source and observed value hashes; record observation timestamps and latency; and include every permitted destination. An observation outside the permitted visibility boundary is treated as a visibility leak and fails the phase. The full run must exercise all six modules and all three visibility classes.

## Gate

```bash
npm run check:attorney-practical-phase2
```

`BLOCKED` means the exact Phase 1 browser evidence has not passed. `READY_TO_RUN` means propagation observations may be captured in staging. Populate the private evidence file from genuine persisted records and module observations. Only `PASSED` completes Phase 2.

The checker is read-only. It performs no database writes, does not bypass RLS, and never touches production.
