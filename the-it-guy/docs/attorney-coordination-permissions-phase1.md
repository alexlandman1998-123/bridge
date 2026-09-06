# Attorney coordination permissions — Phase 1

## Outcome

Cancellation is a first-class workflow capability. It no longer borrows transfer viewing or editing permissions.

An attorney/conveyancer receives lane permissions from explicit practice qualifications:

- `transfer` grants transfer viewing/editing and authority to nominate external bond or cancellation firms;
- `bond` grants bond-registration viewing/editing;
- `cancellation` grants cancellation viewing/editing;
- multiple qualifications combine those permissions without changing transaction-lane ownership.

Assignment remains a separate gate. Holding a practice qualification does not let a user update every matter in that lane. Cross-lane action still requires a matching assignment, management override, or the explicit delegation model planned for Phase 3.

Firm administrators and directors retain operational management permissions. Legacy `attorney_admin` and `attorney_manager` values are not accepted by partner-person selection.

## Gate

Run:

```bash
npm run test:attorney-coordination-phase1
```

The command includes the Phase 0 operating-model contract, the focused Phase 1 permission checks, and the complete attorney role-release suite.
