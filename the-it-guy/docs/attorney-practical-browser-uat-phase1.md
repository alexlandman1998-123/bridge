# Attorney practical release — Phase 1 browser UAT

## Outcome

Phase 1 is an authenticated staging walkthrough for transfer, bond, and cancellation attorneys on desktop and mobile. The gate derives six walkthroughs and 30 action executions directly from the accepted Phase 0 contract, so the test scope cannot silently drift.

Each walkthrough must prove login, access to an assigned matter, all five role actions, a clean browser console, no error overlay, usable responsive controls, a screenshot or trace, and a durable receipt for every action. Evidence is rejected if it belongs to another contract or environment. Open P0/P1 defects fail the phase.

## Safety and execution

Run the gate before using credentials or changing staging data:

```bash
npm run check:attorney-practical-phase1
```

`BLOCKED` means Phase 0 has not been accepted for the exact current fingerprint. `READY_TO_RUN` means the release bar is accepted and the six browser walkthroughs may begin. Copy the example evidence file into the private output directory, populate it only from genuine authenticated browser sessions, then rerun the gate. `PASSED` is the only completion state.

The checker itself is read-only. It never signs in, changes staging, touches production, or manufactures screenshots and receipts.
