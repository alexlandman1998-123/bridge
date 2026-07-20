# Attorney Role Workflow Soundness Check

Date: 2026-05-15

## Scope

Reviewed and hardened the attorney role workflow around firm-level authority and transaction-level lane assignment.

Relevant implementation paths:

- `the-it-guy/src/lib/attorneyPermissions.js`
- `the-it-guy/src/services/transactionAttorneyAssignments.js`
- `the-it-guy/src/pages/AttorneyTransactionDetail.jsx`
- `the-it-guy/src/components/attorney/assignments/*`
- `supabase/migrations/202605150001_attorney_role_hierarchy_lane_permissions.sql`

## Confirmation

- Firm-level roles remain separate from transaction-level attorney roles.
- Attorney admins and managers can view and manage firm matters through firm membership permissions.
- A management user can act as the working attorney only when assigned as the primary attorney on the relevant transaction lane.
- Management view does not automatically grant lane edit access.
- Lane edit access is now checked through `canActAsAttorneyOnLane` / `getAttorneyLaneAccessContext`.
- Transaction workspace workflow updates are blocked when a manager is viewing a matter but is not assigned to the lane.
- Assignment management remains available to managers/admins with assignment permissions.
- Cancellation attorney assignment support has been added alongside transfer and bond lane assignment support.

## Safe Default

The current default is Option A:

- Managers/admins may view all firm matters they are entitled to manage.
- Managers/admins may assign or reassign lane attorneys.
- Managers/admins must assign themselves or another working attorney before editing the lane.

## Product Rule: Transfer Attorney Controls Legal Lanes

Transfer, bond, and cancellation remain separate transaction legal roles and separate workflow views. They should not be collapsed into one person or one assignment by default.

The primary transfer attorney is the legal process controller for the transaction. When a user is assigned as the primary `transfer_attorney` on a transaction, the product should allow that user to operate the `transfer`, `bond`, and `cancellation` workflow lanes for that transaction.

Bond and cancellation attorneys remain lane specialists. They can operate their own assigned lane, but they do not receive reciprocal authority over the transfer lane or each other by default.

This controller rule is distinct from management override:

- Transfer attorney controller authority comes from primary transaction assignment.
- Management override authority comes from firm management status plus `attorney_firms.allow_management_lane_override`.
- Audit metadata should distinguish controller actions from direct lane-assigned attorney actions and management override actions.

## Future Override Setting

The migration adds `attorney_firms.allow_management_lane_override`, defaulting to `false`.

When enabled in future policy work, managers/admins may be allowed to edit unassigned lanes as a management override. The permission helper already treats this as a separate path and exposes `managementOverrideEnabled` so audit logging can distinguish it from assigned-attorney work.

## Audit Events Covered

- `management_assignment_action`
- `manager_assigned_self_to_lane`
- `manager_updated_lane_as_assigned_attorney`
- `manager_attempted_restricted_lane_action`
- `assigned_attorney_action`

Future override events should use `management_override_action` when `allow_management_lane_override` is enabled.

## QA Scenarios

- Attorney manager can view all firm matters: covered by existing `canAccessAttorneyMatter` firm membership logic.
- Attorney manager can assign/reassign attorneys: covered by assignment permissions and UI action visibility.
- Attorney manager can assign self to transfer lane: surfaced through the transaction workspace management action, routed to assignment controls.
- Attorney manager assigned as transfer attorney can update transfer lane: covered by primary lane assignment check.
- Primary transfer attorney can operate bond and cancellation lanes as transaction controller: planned controller rule, distinct from same-person bond/cancellation assignment.
- Attorney manager assigned as bond attorney can update bond lane: helper supports bond lane checks.
- Attorney manager not assigned cannot update lane by default: enforced in `AttorneyTransactionDetail`.
- Attorney manager not assigned can add management note if permitted: existing internal note permissions remain separate.
- Attorney staff cannot view unassigned matters: existing access helper only permits assigned, department, or all-firm visibility.
- Attorney staff assigned to transfer cannot update bond lane: lane matching is explicit.
- Attorney admin can manage users/departments and can also be assigned as working attorney: firm admin role remains full firm access, lane work still checks assignment or future override.
- Assignment changes appear in local audit trail: assignment actions now call `recordAuditEvent`.
- Client never sees management notes: internal/shared visibility controls remain unchanged.

## Verification

- Static code review completed.
- Targeted lint completed with no errors. Existing hook dependency warnings remain in `AttorneyTransactionDetail.jsx`.
- Full `npm run lint` is currently blocked by pre-existing repo-wide lint errors outside this change set.
- Production build passed with the existing CSS minifier warning around `-: TZ.;`.
