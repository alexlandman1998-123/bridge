# Attorney three-role world-class programme — Phase 1 coordination spine

Phase 1 composes the Phase 0 workflow requirements and the legal-role authority contract into one deterministic coordination plan for transfer, bond and cancellation roles.

## Outcome

`buildAttorneyThreeRoleCoordinationPlan` accepts transaction facts plus the appointments and assignments already loaded for a matter. It returns all three roles with:

- whether the role is required and why;
- the canonical coordination state and dimension;
- the appointment and formal-instruction authority;
- the next action and its owner;
- the allowed next states;
- the role's world-class value proposition and owned responsibilities;
- the primary assignment and latest appointment evidence;
- consistency issues that make the matter unsafe to treat as ready.

The plan deliberately keeps requirement, appointment, platform invitation, formal instruction and active matter work as separate dimensions. In particular, `invite_accepted` produces a `confirm_formal_instruction` action and never makes the role ready to work.

## Safety failures

Phase 1 detects:

- records attached to a role the transaction does not require;
- invalid coordination states;
- bank-appointed staff assignments without a bank appointment;
- missing bank-appointment evidence;
- multiple primary assignments;
- an active role without an assignment;
- an active bank role without a verified bank instruction; and
- staff assigned from a firm other than the bank-appointed firm.

These failures make the coordination plan unhealthy and prevent `readyToWork` from becoming true.

## Derivation boundary

The read model only infers states supported by evidence:

- an accepted transfer assignment can make the transfer role active;
- a bank-appointed role uses its persisted coordination state;
- a platform invitation never proves legal instruction;
- a bank-appointed role never becomes active merely because an assignment exists.

Missing evidence falls back to the applicable waiting state instead of inventing progress.

## Verification

```bash
npm run test:attorney-three-role-phase1
```

The suite retains the Phase 0 scenario baseline and authority tests, then verifies cash, all-role trigger, invitation-only, healthy active, unsafe firm/instruction and duplicate-primary cases.

## Phase 1 exit gate

Phase 1 is complete when every downstream surface can consume the same plan without recreating role-state logic. Phase 2 now supplies the cancellation persona and role-scoped mutation permissions against this shared spine.
