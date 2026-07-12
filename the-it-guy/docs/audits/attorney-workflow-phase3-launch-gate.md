# Attorney Workflow Phase 3 Launch Gate

Implemented on 2026-07-12.

## Goal

Add one repeatable attorney workflow launch gate before staging multi-firm smoke. The gate must keep the Phase 0 contract in the evidence chain, prove Phase 1 queue wiring and Phase 2 permission locking still hold, and require the direct Node finance readiness gate before attorney launch readiness can pass.

## Implemented

| Surface | Phase 3 behavior |
| --- | --- |
| Aggregate command | Added `npm run verify:attorney-workflow-phase3-launch-gate`. |
| Phase chain | The aggregate runs Phase 0, Phase 1, and Phase 2 attorney gates in one command. |
| Attorney workflow coverage | Resolver, lane, readiness, and attorney document requirement checks are included. |
| Legal boundary coverage | Legal scenario matrix and legal requirement cardinality checks are included. |
| Finance prerequisite | `node scripts/finance-tab-launch-readiness.test.mjs` is included as the final aggregate prerequisite. |
| Regression guard | Added `npm run test:attorney-workflow-phase3-launch-gate` to protect gate composition. |

## Aggregate Gate Steps

| Gate step | Command |
| --- | --- |
| Phase 0 contract | `node scripts/attorney-workflow-contract-phase0.test.mjs` |
| Phase 1 queue actions | `node scripts/attorney-workflow-phase1-queue-actions.test.mjs` |
| Phase 2 permission lock | `node scripts/attorney-workflow-phase2-permission-lock.test.mjs` |
| Attorney resolvers | `node scripts/verify-attorney-workflow-resolvers.mjs` |
| Attorney lanes | `node scripts/verify-attorney-workflow-lanes.mjs` |
| Attorney readiness | `node scripts/verify-attorney-readiness.mjs` |
| Attorney document requirements | `node scripts/verify-attorney-document-requirements.mjs` |
| Legal scenario matrix | `node scripts/legal-scenario-matrix.test.mjs` |
| Legal requirement cardinality | `node scripts/legal-requirement-cardinality-phase2.test.mjs` |
| Finance readiness | `node scripts/finance-tab-launch-readiness.test.mjs` |

## Deferred

- Phase 4 multi-firm smoke harness is implemented in `docs/audits/attorney-workflow-phase4-multi-firm-smoke.md`; strict live staging evidence is still required.
- Phase 5 signing appointment workflow is implemented in `docs/audits/attorney-workflow-phase5-signing-appointments.md`.
- Phase 6 person-level attorney UX is implemented in `docs/audits/attorney-workflow-phase6-person-level-requirements.md`.
- Phase 7 actionable blocker UX is implemented in `docs/audits/attorney-workflow-phase7-actionable-blockers.md`.
- Phase 8 exceptional legal scenario ownership is implemented in `docs/audits/attorney-workflow-phase8-exceptional-legal-scenarios.md`.
- Phase 9 pilot monitoring is implemented in `docs/audits/attorney-workflow-phase9-pilot-monitoring.md`.

## Verification

```bash
npm run test:attorney-workflow-phase3-launch-gate
npm run verify:attorney-workflow-phase3-launch-gate
```

## Phase 3 Acceptance

- [x] Aggregate launch command exists.
- [x] Aggregate command includes the Phase 0 contract gate.
- [x] Aggregate command includes Phase 1 queue-action and Phase 2 permission-lock gates.
- [x] Existing attorney resolver/lane/readiness/document gates remain in the launch chain.
- [x] Finance readiness direct Node gate is included and must pass.
- [x] Regression test exists: `npm run test:attorney-workflow-phase3-launch-gate`.

Decision: GO TO PHASE 4 WITH ATTORNEY AGGREGATE GATE GREEN.
