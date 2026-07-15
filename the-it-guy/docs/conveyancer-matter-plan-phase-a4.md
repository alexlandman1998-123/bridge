# Conveyancer Matter Plan — Phase A4

## Purpose

Phase A4 turns one valid active matter plan into one deterministic operational action queue. It does not create another workflow engine: the A1 plan remains the source of truth and the queue is a read-only projection.

The executable queue builder is `src/services/attorneyWorkflow/conveyancerMatterActionQueue.js`.

## Queue behaviour

- All legal, administrative and financial actions appear in one ordered collection.
- Review and executable work rank ahead of blockers, waiting items and future work.
- An upcoming action is derived as ready when all required dependencies are complete, without mutating its stored state.
- Cancelled or blocked required dependencies surface as blockers.
- Fixed, plan-relative, action-relative, event-relative and inherited due-date rules are resolved.
- Due dates are classified as overdue, due today, due soon, scheduled or unscheduled in the requested timezone.
- Every item shows its owner, dependency state and exact missing evidence.
- One primary executable action and one primary attention item are exposed.
- Completed and cancelled work is hidden by default but can be included.

## Permission boundary

The full queue stays visible to authorised matter participants. Execution is permitted only when the actor owns the action, matches its user/team assignment and has the required A1 capability. Firm managers retain the A1 override. Work owned by bond or cancellation attorneys remains visible to the transfer team but read-only.

## Phase boundary

A4 does not update action state, complete evidence, persist a queue, send reminders or replace the current attorney UI. It provides the single read model those later capabilities can consume.

