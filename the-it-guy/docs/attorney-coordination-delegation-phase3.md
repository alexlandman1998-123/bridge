# Attorney coordination Phase 3 — controlled delegation

Phase 3 permits an assigned transfer attorney to perform specific work on a bond or cancellation lane only after the responsible lane attorney or an authorised firm lead grants it.

## Safety boundary

- A grant is scoped to one transaction, one bond/cancellation lane, one named transfer attorney, selected capabilities, and an expiry of no more than 30 days.
- Supported capabilities are workflow progression, document actions, internal notes, and shared updates.
- The grant cannot exceed the responsible assignment's own capability flags.
- Only the responsible assigned attorney or responsible firm's lead may grant or revoke it.
- The delegate must already be the active transfer attorney on the same matter.
- Grants and revocations create internal transaction events; ordinary mutations continue to record the authenticated actor.
- The workspace displays an “acting on behalf” banner, capability list, and expiry.

## Deployment dependency

Apply `20260906070938_attorney_lane_delegation_phase3.sql` before enabling the UI in an environment. Until that migration is applied, delegation lookup safely resolves to no delegation and the existing direct-assignment rules remain in force.

## Verification

Run `npm run test:attorney-coordination-phase3`. A database-backed test of grant, delegated mutation, expiry, revocation, and audit rows is still required in the target environment before release approval.
