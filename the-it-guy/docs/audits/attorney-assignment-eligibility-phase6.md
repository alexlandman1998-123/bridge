# Attorney assignment eligibility — Phase 6

## Outcome

Transaction assignment now consumes the canonical professional profile introduced in Phase 3 and managed through onboarding and Settings in Phases 4–5. Compatibility firm roles are no longer used to decide who appears in a transaction-lane assignment selector or who passes application validation.

## Eligibility contract

- `attorney_conveyancer` requires the matching practice qualification for a primary or supporting lane assignment.
- Transfer requires `transfer`, bond requires `bond`, and cancellation requires the explicit `cancellation` qualification.
- A combined transfer-and-bond assignment accepts a conveyancer qualified for either participating lane, preserving the existing combined-assignment behavior.
- `firm_admin` and `director_partner` retain management eligibility across lanes.
- `candidate_attorney` may be a supporting attorney, secretary, or admin handler, but never the primary attorney.
- `conveyancing_secretary` and `admin_staff` remain limited to their support slots.
- `viewer` has no assignment eligibility.
- Every assignee must still have an active membership in the selected firm.

## Enforcement layers

The assignment service filters candidate lists and validates every create/update payload. Migration `202607180039_attorney_assignment_qualification_phase6.sql` adds the same fail-closed rule as a database trigger. Firm-only allocations without an individual assignee remain valid; once a user is selected, their active professional profile must qualify.

The trigger does not rewrite historical assignments and ignores updates that do not change assignment identity, lane, slot, or status. Phase 7 can therefore cut over compatibility role storage separately.

## Verification

Run `npm run test:attorney-assignment-eligibility-phase6` and the Phase 0–5 attorney role suites.
