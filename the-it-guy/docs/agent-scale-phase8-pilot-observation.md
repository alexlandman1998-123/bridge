# Agent scale Phase 8 — pilot observation and scale decision

Phase 8 converts a completed controlled pilot into a deterministic `READY_TO_SCALE` or `HOLD` decision. It is read-only and does not deploy, expand the cohort, toggle flags, apply migrations, contact users, or modify the API module.

The decision requires:

- the exact Phase 7 `READY_FOR_PILOT` receipt and its SHA-256 evidence digest;
- a pilot observation window of at least 24 hours, completed within the last 24 hours and starting after Phase 7;
- identity matching for source revision, deployment origin, pilot organisation and feature flag;
- at least 100 sessions and 40 Calendar route samples;
- technical errors at or below 0.5%, failed requests at or below 1%, and Calendar core-ready p95 at or below 2,500 ms;
- zero cross-organisation leakage, unexpected RLS denials, critical incidents and unresolved high incidents;
- a successful kill-switch rollback drill completed within 15 minutes;
- named monitoring and support reviewers.

Run `npm run verify:agent-scale-phase8` for the deterministic gate. Place the reviewed observation input at `test-results/agent-phase8/pilot-observation-input.json`, then run `npm run check:agent-scale-phase8`. Missing or mismatched evidence produces `HOLD`.
