# Attorney practical release — Phase 7 controlled rollout

Phase 7 separates release approval from execution authorization. It accepts only the exact approved Phase 6 candidate, exact production project, named feature flag, approved cohort reference, and a unique one-to-three organisation cohort. Execution requires `EXECUTE_ATTORNEY_CONTROLLED_RELEASE`.

After an operator promotes the prevalidated artifact, the receipt must prove the same revision and build hash, READY HTTPS deployment, exact cohort activation, available kill switch, authenticated smoke tests for all three attorney roles, all six update destinations, monitoring evidence, and explicit zero safety counters. A target, cohort, permission, visibility, integrity, propagation, or production-error breach returns `ROLLBACK`.

Run `npm run check:attorney-practical-phase7`. The checker only validates request and receipt files; it does not deploy, promote, modify flags, or activate organisations.
