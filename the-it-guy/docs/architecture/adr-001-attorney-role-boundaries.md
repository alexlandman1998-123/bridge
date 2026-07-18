# ADR-001: Attorney Role Boundaries

- Status: Accepted for phased implementation
- Date: 2026-07-18
- Owners: Attorney module and platform authorization maintainers
- Scope: Signup, onboarding, invitations, settings, attorney operations, transaction workflows, and RLS

## Context

The attorney module currently resolves authority from several overlapping sources: the application role on `profiles`, generic workspace membership in `organisation_users`, attorney membership in `attorney_firm_members`, compatibility metadata on the profile/auth user, and transaction-level attorney assignments. Role lists and permission matrices are also declared in more than one frontend module.

This makes it possible for signup, onboarding, Settings, service authorization, and database policies to interpret the same user differently. Phase 0 freezes that surface and records the intended ownership boundaries before security or data migrations begin.

## Decision

Attorney access is divided into three independent layers:

1. **Application role** — `profiles.role = 'attorney'` selects the module. It does not grant access to a firm or matter.
2. **Workspace membership and professional profile** — active workspace membership grants firm scope; the attorney extension records professional role, department, and practice qualifications. During the transition, `attorney_firm_members` remains the attorney module's preferred membership record and `organisation_users` remains the generic workspace record.
3. **Matter assignment** — `transaction_attorney_assignments.attorney_role` grants a transaction lane: `transfer_attorney`, `bond_attorney`, or `cancellation_attorney`.

The target architecture makes `organisation_users` the canonical workspace membership, retains an attorney-specific extension for professional data, and keeps transaction assignments as the only source of lane authority. Permission decisions must require an active membership plus the relevant scoped permission and, where applicable, a lane assignment.

## Authority rules

- Signup intent may select an onboarding path; it may not self-grant a professional or management role.
- A public operational signup remains pending until an invitation is accepted or a firm administrator approves access.
- The initial firm administrator is created only by a server-controlled bootstrap operation that verifies firm ownership.
- Missing, unreadable, suspended, or removed membership fails closed.
- `profiles.attorney_role` and auth `user_metadata.attorney_role` are compatibility mirrors, not authorization sources.
- Firm roles and transaction roles are not interchangeable.
- Practice qualifications (`transfer`, `bond`, `cancellation`) are distinct from both firm authority and transaction assignment.
- RLS is the final authorization boundary; frontend visibility is not a security control.

## Target role model

The target professional roles are:

- `firm_admin`
- `director_partner`
- `attorney_conveyancer`
- `candidate_attorney`
- `conveyancing_secretary`
- `admin_staff`
- `reception_scheduling`
- `viewer`

The target practice qualifications are `transfer`, `bond`, and `cancellation`. Transaction roles remain `transfer_attorney`, `bond_attorney`, and `cancellation_attorney`.

## Change-control rule

Until the canonical catalogue is introduced in Phase 2:

- Do not add another attorney firm-role registry.
- Do not introduce a new attorney role literal without updating the Phase 0 inventory, mapping, deprecation register, and governance test.
- Do not use profile or auth metadata as a new authorization fallback.
- Do not add a Settings-only or onboarding-only role that cannot round-trip through invitations and persistence.

The automated check is `npm run test:attorney-role-governance-phase0`.

## Consequences

Phase 0 does not remove existing compatibility paths. It makes them explicit debt and prevents their silent expansion. Later phases can change the implementation behind a stable, reviewed contract and can update the baseline deliberately as deprecated paths are removed.

