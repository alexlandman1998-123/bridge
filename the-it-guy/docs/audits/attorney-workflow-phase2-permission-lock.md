# Attorney Workflow Phase 2 Permission Lock

Implemented on 2026-07-12.

## Goal

Close the Phase 0 security blocker where attorney workflow editing was broadened by the temporary Phase 1 shared-editing path. Attorney lane mutations must now be scoped to the assigned lane and the assigned firm so transfer, bond, and cancellation work can proceed without cross-firm edits.

## Implemented

| Surface | Phase 2 behavior |
| --- | --- |
| Lane mutation rights | Removed the broad all-lane Phase 1 edit branch. Update, request, upload, review, signing, and client-visible publish rights now require lane mutation rights. |
| Assigned attorney rights | Assigned transfer, bond, and cancellation attorneys can mutate only their own lane, subject to the assignment `can_update_workflow_lane` flag. |
| Firm management override | Firm admin/director partner override remains available only when the manager belongs to the firm assigned to that exact lane. |
| Cross-firm protection | A membership in another firm on the same matter no longer falls back into edit rights for the target lane. |
| Mutation guards | Workflow stage updates, document requests, and document reviews continue to route through scoped lane permission guards. |

## Permission Contract

| Actor | Can view | Can mutate |
| --- | --- | --- |
| Assigned transfer attorney | Required matter lanes | Transfer lane only |
| Assigned bond attorney | Required matter lanes | Bond lane only |
| Assigned cancellation attorney | Required matter lanes | Cancellation lane only |
| Firm admin/director partner | Firm-assigned matter lanes | Lanes assigned to that same firm |
| Other assigned firm on same matter | Shared matter visibility where permitted | No mutation on another firm's lane |
| Agent/developer/bond professional participant | Legal workspace visibility where participant/legacy assignment allows | No attorney lane mutation |

## Deferred

- Phase 3 aggregate launch gate is implemented in `docs/audits/attorney-workflow-phase3-launch-gate.md`.
- Phase 4 multi-firm smoke harness is implemented; strict live staging evidence is still required.
- Role-specific UI affordances can be made more explicit later, but the service layer now denies the unsafe mutation path.

## Verification

```bash
npm run verify:attorney-workflow-phase2-permission-lock
npm run verify:attorney-workflow-phase1-queue-actions
npm run verify:attorney-workflow-phase0-contract
```

## Phase 2 Acceptance

- [x] The `PHASE_ONE_SHARED_WORKFLOW_EDITING` runtime flag is removed.
- [x] Lane mutation permissions derive from `canActOnLane`, not from matter-level visibility or any assignment.
- [x] Firm-management override requires membership in the lane's assigned firm.
- [x] Cross-firm assigned users can view permitted matter context without mutating another firm's lane.
- [x] Mutation guards for stage updates, document requests, and document reviews remain wired.
- [x] Regression test exists: `npm run verify:attorney-workflow-phase2-permission-lock`.

Decision: GO TO PHASE 3 WITH LANE-SCOPED ATTORNEY MUTATIONS.
