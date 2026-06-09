# Sprint 6: Branch Manager Operating Model & Branch Command Centre

## Section A: Branch Architecture Report

Current operating model:

```text
Organisation
  -> Branch
    -> organisation_users.branch_id / primary_branch_id
    -> Leads.branch_id
    -> Private Listings.branch_id
    -> Transactions.assigned_branch_id
```

Branch data is loaded through `agencyBranchService`, which now distinguishes:

- Structural management: `manageBranches`
- Branch operations: `manageUsers` / `assignLeads` / `manageBranches`

Branch managers receive branch operating access only. If a branch manager has no assigned branch, the branch service returns no branches instead of broad organisation data.

## Section B: Branch Manager Role

Branch Manager is treated as a first-class operating role through:

- `permissionRegistry`: branch-only permissions for agency resources.
- `agencyAuthorityService`: branch manager authority for branch agents and branch asset reassignment.
- `roles`: branch managers land on Branch Command and do not see Governance, Analytics, or organisation-wide Reports.

## Section C: Branch Dashboard

Added:

- `/agency/branch-command-centre`
- `BranchCommandCentrePage`
- `branchManagerOperatingService`

The dashboard shows:

- Branch health score
- Active agents
- Open leads
- Active listings
- Pipeline value
- Attention required
- Branch team workload
- Governance boundaries
- Branch ownership coverage
- Branch ranking

## Section D: Agent Management Workspace

Branch managers can review branch team workload inside Branch Command.

The broader `/agency/agents` directory remains principal/owner scoped until the agent directory receives a full branch-only data audit.

## Section E: Asset Reassignment Controls

Branch Command exposes branch workload and reassignment entry points without creating duplicate transfer logic.

Existing ownership transfer engines from earlier sprints remain the source for actual asset reassignment.

## Section F: Branch Health Engine

Branch health is a frontend-derived score based on:

- Branch active state
- Manager assignment
- Active agents
- Active listings
- Active transactions
- Conversion rate
- Pipeline value

No new database fields were added.

## Section G: Governance Rules

Branch Manager can:

- View branch agents
- Invite branch agents
- Reassign branch leads
- Reassign branch listings
- Reassign branch transactions

Branch Manager cannot:

- Manage other branches
- Create principals
- Delete the organisation
- Change billing

## Section H: RLS Validation Report

Existing branch-scope infrastructure includes:

- `branch_id`
- `primary_branch_id`
- `branch_scope`
- `bridge_current_branch_id`
- `bridge_can_access_branch_record`

Frontend and service-level branch filtering are now aligned for branch operations.

Remaining rollout requirement:

- Complete table-by-table RLS validation for appointments, documents, analytics, and any legacy screens that bypass `agencyBranchService`.
- The command centre is intentionally branch-derived and does not weaken RLS, but RLS remains the required source of truth before national rollout.
