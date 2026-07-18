# Attorney professional-role persistence — Phase 3

## Outcome

Phase 3 adds an additive professional-profile layer to attorney membership persistence. Firm authority, professional role, practice qualification, and transaction-lane assignment now have distinct storage contracts.

## Canonical persisted model

`attorney_firm_members` and pending attorney invitations now store:

- `professional_role`: one of `firm_admin`, `director_partner`, `attorney_conveyancer`, `candidate_attorney`, `conveyancing_secretary`, `admin_staff`, `reception_scheduling`, or `viewer`.
- `practice_qualifications`: any validated combination of `transfer`, `bond`, and `cancellation`.
- `role`: the temporary compatibility role consumed by authorization code until the later permission cutover.

The member extension links to `organisation_users` through `organisation_user_id`. Generic workspace authority remains in `organisation_users.role` / `workspace_role`; attorney-specific fields are mirrored into dedicated `attorney_*` extension columns for Settings display and migration continuity.

## Backfill rules

- `transfer_attorney` becomes `attorney_conveyancer` with the `transfer` qualification.
- `bond_attorney` becomes `attorney_conveyancer` with the `bond` qualification.
- Existing management and support roles retain their professional role without inferred qualifications.
- Unknown or ambiguous values become `viewer` and gain no operational permissions.
- Transaction assignment roles are not rewritten.

## Rollout safety

The migration is additive and idempotent. Database triggers keep professional fields and the compatibility role synchronized. Settings reads have a missing-column fallback so the frontend can tolerate the migration deployment boundary. Profile `attorney_role` remains only a compatibility mirror.

## Verification

Run `npm run test:attorney-role-persistence-phase3`. The contract verifies catalogue mappings, database constraints and backfills, membership/invitation writes, Settings propagation, and transaction-role isolation.
