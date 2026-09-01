# Portal Controlled Pilot Gate — Phase 5

Phase 5 is the decision point after the Phase 4 rehearsal. It does **not** approve a public or production launch. A passing receipt permits only a named, limited internal pilot using a non-production transaction.

## Required receipt

Run `npm run test:portal-controlled-pilot-phase5` to protect the gate contract. For the actual pilot decision, call `buildPortalPilotReleaseGate()` with the recorded Phase 4 evidence:

- a transaction id, reviewer and review timestamp;
- a complete desktop, mobile, primary-action and recovery walkthrough for buyer, seller, agency and developer;
- verified buyer and seller document uploads, including confirmation and retry handling;
- evidence that buyer, seller, agency, developer, bond originator and transfer-attorney updates synchronise, remain after refresh, and stay role-isolated; and
- every finding marked either `blocker` or `warning`. Warnings require both a named owner and due date. Any blocker prevents the pilot.

## Decision boundary

`ready_for_internal_pilot` means the evidence is complete for one limited internal pilot. It remains deliberately non-production, and `productionReleaseAllowed` is always `false`.

`blocked` means that evidence is incomplete, a role's mobile or recovery journey failed, an upload was not proven, sync/visibility was not proven for every role, a rehearsal blocker exists, or an unowned/undated warning remains.

Keep the returned receipt together with the Phase 4 screenshots. Do not use customer records for the rehearsal or substitute this code gate for a real human walkthrough.
