# Attorney practical release — Phase 9 graduated expansion

Phase 9 turns a healthy production pilot into an immutable, explicitly approved expansion plan. Targeting remains default-off and uses stable organisation-ID allowlists with logged flag evaluations.

Every wave may at most double the current cohort, cannot repeat organisations, and must retain at least 24 hours, 30 actions, five actions per attorney role, 99% success, propagation p95 ≤120 seconds, all destinations healthy, zero safety incidents, and separate authorization before the next wave. The kill switch must remain verified with rollback under 15 minutes.

Run `npm run check:attorney-practical-phase9`. A valid plan reaches `READY_FOR_APPROVAL`; the release owner must approve its exact fingerprint using `APPROVE_ATTORNEY_GRADUATED_EXPANSION`. The checker does not modify flags, expand cohorts, or mutate production.
