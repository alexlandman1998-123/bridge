# Transaction Journey Alignment: Phase 5

Phase 5 aligns the remaining internal professional and developer overview surfaces with the canonical transaction journey introduced in Phase 2.

## Included surfaces

- Developer and agent views of the unit transaction workspace
- Attorney Matter Command Center
- Bond Originator overview workspace

Each surface receives the same `transactionJourneySnapshot` presentation used by the agent, buyer, and seller portals. The current-stage panel therefore reports the same direct workflow item and owner to every participant.

## Specialist workflow boundaries

The canonical tracker represents the shared property transaction from OTP through registration. Role-specific operational trackers remain beneath it:

- attorneys retain their legal lane actions, blockers, and coordination queue;
- bond originators retain their application, bank-submission, quote, and grant journey;
- developers retain their transaction readiness and workflow controls.

Those trackers answer a different question and do not redefine the shared macro milestone.

## Loading behavior

The shared renderer now provides a fixed six-milestone loading shell. A workspace waits for its rollup without first painting an empty state or a different five-stage lifecycle rail. If the rollup fails, the developer workspace keeps the existing lifecycle component as an explicit compatibility fallback.

Public unauthenticated status-share surfaces remain outside this phase because they require a separately scoped snapshot endpoint and access-policy review.
