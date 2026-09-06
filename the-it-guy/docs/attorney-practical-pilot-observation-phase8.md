# Attorney practical release — Phase 8 pilot observation

Phase 8 observes the active controlled production pilot for at least 24 hours and 30 authenticated actions, with five per attorney role, 99% success, propagation p95 at or below 120 seconds, hourly health checks, all six destinations, and all six role/device browser checkpoints.

It also requires a bounded runtime-log scan for the deployed artifact, zero errors/5xx/timeouts, and p75 user-performance targets of LCP ≤2.5s, INP ≤200ms and CLS ≤0.1. Any security, visibility, integrity, propagation, or permission-boundary incident returns `ROLLBACK`; incomplete operational evidence returns `HOLD`.

Run `npm run check:attorney-practical-phase8`. Only `READY_FOR_EXPANSION` completes the phase. The checker does not expand the cohort or mutate production.
