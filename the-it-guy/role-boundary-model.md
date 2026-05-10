# Role Boundary Model

## Canonical Role Layers

## 1. App Role (Identity-level module access)
Used to select module shell and onboarding branch.

Allowed values:
- `developer`
- `agent`
- `attorney`
- `bond_originator`
- `client`
- `viewer` (transitional/recovery only)

Source of truth:
- `profiles.role`

## 2. Organisation Role (Membership + scope in a company/team)
Used for organisation-level permissions and team management.

Allowed values (canonical target set):
- `owner`
- `principal`
- `admin`
- `manager`
- `member`
- `agent`
- `viewer`

Current operational values in DB may include legacy variants (`super_admin`, `developer`, `branch_manager`, etc.) and should be normalized in service logic.

Source of truth:
- `organisation_users.role`
- constrained by `organisation_users.status` (`invited`, `active`, etc.)

## 3. Transaction Role (workflow participant role)
Used only for workflow assignment/read scope.

Examples:
- `buyer`
- `seller`
- `agent`
- `developer`
- `attorney`
- `bond_originator`
- `admin`

Source of truth:
- transaction participant and assignment tables (for example `transaction_participants`, `transaction_attorney_assignments`).

## Boundary Rules

1. App role must not be reused as organisation role.
2. Organisation role must not automatically infer transaction role.
3. First-time signup must resolve only app role + baseline profile.
4. Organisation role attachment is post-dashboard (or invite claim) and must be retryable.
5. Workflow access checks must depend on organisation/transaction role state, never on onboarding page local state.

## Lifecycle Ownership

- Auth layer owns session establishment and restoration.
- Profile layer owns baseline profile integrity.
- App role layer owns module routing.
- Organisation layer owns memberships and org settings.
- Permission layer owns scoped access checks.
- Workflow layer owns record-level read/write paths.
