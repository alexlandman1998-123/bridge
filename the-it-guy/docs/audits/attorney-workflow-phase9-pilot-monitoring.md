# Attorney Workflow Phase 9 Pilot Monitoring

Date: 2026-07-12

## Goal

Track stuck-matter metrics and pilot feedback inside the attorney matter workflow so the pilot has visible operational signals before transactions stall.

## Implemented

- Added an attorney overview Pilot Monitor panel.
- Added stuck-matter metrics for idle days, blocked lanes, document gaps, overdue lanes, roleplayer blockers, and legal exception boundaries.
- Added pilot feedback tracking by detecting internal notes that include pilot feedback markers.
- Added a Log Pilot Feedback action that drafts an internal attorney note with the current pilot health, idle days, blocked lanes, document gaps, and open signals.
- Preserved the existing Phase 9 coordination verifier as a prerequisite for the new pilot monitoring gate.
- Preserved Phase 8 exceptional legal scenario ownership as a prerequisite before pilot monitoring can pass.

## Verification

```bash
npm run test:attorney-workflow-phase9-pilot-monitoring
npm run verify:attorney-workflow-phase9-pilot-monitoring
```

The full Phase 9 verification command runs:

- Attorney workflow Phase 8 exceptional legal scenario gate.
- Existing attorney Phase 9 coordination verifier.

## Phase 9 Acceptance

- [x] Attorney overview shows stuck-matter metrics for idle days, blocked lanes, and document gaps.
- [x] Attorney overview shows pilot feedback capture status.
- [x] Pilot feedback can be drafted as an internal attorney note tied to a workflow lane.
- [x] Phase 8 exceptional legal scenario ownership remains green.
- [x] Existing Phase 9 coordination verifier remains green.
- [x] Verification command exists: `npm run verify:attorney-workflow-phase9-pilot-monitoring`.

## Deferred

- Strict live multi-firm evidence remains pending from Phase 4 until staging fixture values are supplied.
- Aggregate pilot cohort reporting can be added once live pilot matters are selected.

Decision: READY FOR ATTORNEY PILOT MONITORING.
