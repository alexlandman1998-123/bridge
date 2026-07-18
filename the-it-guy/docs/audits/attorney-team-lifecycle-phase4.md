# Attorney signup and team lifecycle — Phase 4

## Outcome

Phase 4 establishes one attorney-team invitation boundary and closes the public operational-signup role gap. Onboarding, later Settings work, invitation acceptance, member updates, and member removal now have a shared service contract.

## Public signup boundary

`attorney_operational` has an explicit role contract. It selects the attorney application module and creates a pending workspace-access request, but it does not create an active firm membership or self-assign a professional role. The request is persisted as `viewer` with no practice qualifications until a protected invitation or administrator approval confirms the professional profile.

The owner contract remains separate and may only bootstrap `firm_admin` through the verified firm-owner RPC introduced in Phase 1.

## Shared team service

`src/services/attorneyTeamService.js` owns the application-level lifecycle contract for:

- invitation normalization and validation;
- canonical professional role and qualification payloads;
- compatibility-role derivation during the transition;
- active-department validation;
- roster and department reads;
- invitation acceptance;
- member updates and removal.

Attorney onboarding now uses this service instead of calling the legacy invitation service directly. The lower-level invitation persistence service remains internal to the shared boundary.

## Security rules

- `firm_admin` cannot be invited through the ordinary team workflow.
- An `attorney_conveyancer` requires at least one confirmed practice qualification.
- Department selection must be compatible with the professional profile.
- A public signup request never inserts an attorney firm membership.
- Practice qualification alone never grants transaction access.

## Deferred to Phase 5

The generic Attorney Firm users page still sends generic organisation invitations. Phase 5 will replace that editor with the shared attorney-team service and canonical role controls after the Phase 4 lifecycle contract is stable.

## Verification

Run `npm run test:attorney-team-lifecycle-phase4`.
