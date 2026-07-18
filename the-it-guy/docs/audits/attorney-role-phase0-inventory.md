# Attorney Role Phase 0 Inventory

## Executive summary

The repository has three valid role layers, two membership stores, three duplicate firm-role declarations, two transaction-role declarations, two permission models, and several compatibility fallbacks. This document is the Phase 0 baseline for the staged attorney-role migration.

## Canonical ownership by layer

| Layer | Current source | Phase 0 status | Target owner |
|---|---|---|---|
| Application/module role | `profiles.role`, normalized app-role metadata | Canonical for routing only | `profiles.role` |
| Generic workspace membership | `organisation_users` | Canonical for generic Settings today | `organisation_users` |
| Attorney firm membership | `attorney_firm_members` | Preferred by attorney permission resolution | Attorney extension linked to `organisation_users` |
| Profile attorney role | `profiles.attorney_role` | Transitional mirror | Derived/display-only, then removed |
| Auth attorney role | `user_metadata.attorney_role` | Deprecated fallback | Removed from authorization |
| Attorney transaction lane | `transaction_attorney_assignments.attorney_role` | Canonical for lane assignment | Same table |
| Attorney permissions | Generic permission registry plus attorney-specific map | Split | One canonical attorney catalogue and scoped resolver |

## Current firm roles

The database and primary attorney permission module accept:

| Current value | Current meaning | Target | Migration treatment |
|---|---|---|---|
| `firm_admin` | Firm administrator/owner | `firm_admin` | Retain |
| `director_partner` | Firm leadership | `director_partner` | Retain |
| `transfer_attorney` | Professional role mixed with transfer specialization | `attorney_conveyancer` + `transfer` | Split role and qualification |
| `bond_attorney` | Professional role mixed with bond specialization | `attorney_conveyancer` + `bond` | Split role and qualification |
| `conveyancing_secretary` | Conveyancing support | `conveyancing_secretary` | Retain |
| `admin_staff` | Administration/accounts | `admin_staff` | Retain |
| `reception_scheduling` | Reception and scheduling | `reception_scheduling` | Retain |
| `candidate_attorney` | Candidate attorney | `candidate_attorney` | Retain |

The target also introduces `viewer` as the explicit fail-closed/no-operational-authority role. It is not added to persistence until the database phase.

## Transaction roles

These values represent matter lanes and remain unchanged:

| Value | Lane |
|---|---|
| `transfer_attorney` | Transfer |
| `bond_attorney` | Bond |
| `cancellation_attorney` | Cancellation |

`cancellation_attorney` is not a firm job role. In the target model, an attorney with the `cancellation` qualification may be assigned to that lane.

## Generic organisation-role mapping

Current normalization maps attorney-specific membership roles into generic Settings roles:

| Attorney role | Generic role today | Known loss of information |
|---|---|---|
| `firm_admin` | `owner` | Attorney role ID is lost |
| `director_partner` | `partner` | Director/partner distinction is flattened |
| `transfer_attorney` | `attorney` | Transfer specialization is lost |
| `bond_attorney` | `attorney` | Bond specialization is lost |
| `candidate_attorney` | `attorney` | Candidate restrictions are lost |
| `conveyancing_secretary` | `admin_staff` | Secretary capabilities are lost |
| `reception_scheduling` | `admin_staff` | Scheduling specialization is lost |

This is why generic Settings cannot safely be the only attorney team editor before the membership model is unified.

## Registry inventory

### Firm-role declarations

- Canonical transitional registry: `src/lib/attorneyPermissions.js`
- Known duplicate: `src/lib/api.js`
- Known duplicate: `src/lib/profileApi.js`

No additional `ATTORNEY_FIRM_ROLE_VALUES` declaration is permitted during the freeze.

### Transaction-role declarations

- `src/constants/attorneyPermissions.js`
- `src/services/transactionAttorneyAssignments.js`

Both must contain exactly the three canonical transaction roles until Phase 2 consolidates them.

### Permission declarations

- Attorney-specific firm permission map: `src/lib/attorneyPermissions.js`
- Lane/management matrix: `src/constants/attorneyPermissions.js`
- Generic workspace permissions: `src/auth/permissions/permissionRegistry.js`

`attorney_admin` and `attorney_manager` exist only in the secondary lane/management model and are not valid persisted firm roles.

## Signup and onboarding inventory

- Public signup exposes `attorney_owner` and `attorney_operational` intents.
- Only `attorney_owner` has a canonical role contract.
- The role-contract fallback currently resolves an attorney-firm context to the owner contract.
- Attorney onboarding invites use the attorney-specific eight-role list.
- Operational users should not be allowed to create an active firm membership without invitation or approval.

The missing operational contract is recorded debt for the signup phase; Phase 0 does not change signup behavior.

## Settings inventory

- Attorney onboarding persists attorney-specific invitations.
- `SettingsUsersPage` uses generic organisation roles and generic workspace invitations.
- Settings role changes update `organisation_users` rather than the attorney membership record.
- `AttorneyFirmSettingsPage` manages firm identity/branding but not the full attorney team contract.

The target Settings implementation must use the same invitation and membership service as attorney onboarding.

## Authorization fallback inventory

The following are transitional or unsafe authorization paths to remove in later phases:

- Synthetic `firm_admin` membership when a firm ID exists but membership is missing.
- Synthetic `firm_admin` recovery when member listing is denied by RLS.
- `user_metadata.attorney_role` fallback in attorney operations and incoming-matter services.
- Unknown firm-role normalization falling back to `candidate_attorney`.
- Shared Phase 1 workflow editing overriding role-specific capabilities.
- Profile role mirrors being updated independently from canonical membership.

## Deprecation register

| Item | Classification | Removal phase | Replacement |
|---|---|---|---|
| Duplicate `ATTORNEY_FIRM_ROLE_VALUES` declarations | Deprecated registry | Phase 2 | Canonical catalogue |
| `ATTORNEY_ROLE_PERMISSION_MATRIX` as a second permission model | Transitional/unintegrated | Phase 2 | Canonical catalogue and resolver |
| `attorney_admin` | Unpersistable legacy role | Phase 2 | `firm_admin` or scoped management permission |
| `attorney_manager` | Unpersistable legacy role | Phase 2 | `director_partner` or scoped management permission |
| `profiles.attorney_role` authorization | Deprecated fallback | Phases 3–9 | Canonical membership context |
| `user_metadata.attorney_role` authorization | Deprecated fallback | Phases 1–9 | Canonical membership context |
| Synthetic firm-admin membership | Unsafe compatibility path | Phase 1 | Verified bootstrap RPC and fail-closed access |
| Attorney-specific role stored only in `organisation_users` | Transitional mirror | Phases 3–7 | Canonical membership plus attorney extension |
| Separate onboarding and Settings invite paths | Split workflow | Phases 4–5 | Shared attorney team service |
| `transfer_attorney`/`bond_attorney` as firm job roles | Derived compatibility mirror after Phase 7 | Phases 3 and 7 | Professional role plus practice qualification |

## Phase 7 cutover update

Authorization, RLS management helpers, operational dashboards, matter visibility, and transaction-access projection now consume `professional_role` plus `practice_qualifications`. The `role` column remains a derived, non-authoritative compatibility mirror pending final cleanup and rollout telemetry.

## Phase 8 integrity update

The read-only `attorney_role_integrity_v1` projection and strict audit command now gate compatibility cleanup on mirror consistency, organisation-extension linkage, and open transaction-assignment eligibility. Phase 8 performs no automatic repair or destructive schema change.

## Phase 9 release update

Compatibility membership and invitation roles are now enforced as derived-only mirrors. Per-firm certification records a passing live Phase 8 gate before rollout completion. Physical column removal remains separately gated on certification coverage and external-consumer inventory.

## Phase 0 invariants

- The application role `attorney` grants module routing only.
- The eight current firm-role values are frozen until migration code exists.
- Transaction roles are exactly transfer, bond, and cancellation attorney.
- A new role requires an inventory, mapping, persistence, invitation, Settings, permission, RLS, and migration decision.
- Unknown roles must not be designed to gain authority.
- Phase 0 documentation and the governance test must change together.

## Verification

Run:

```bash
npm run test:attorney-role-governance-phase0
```

The test validates the documented baseline, frozen registries, transaction-role contract, signup intents, and known legacy-role containment.
