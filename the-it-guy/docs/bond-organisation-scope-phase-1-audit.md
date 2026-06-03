# Bond Organisation Scope Phase 1 Audit

## Current Service Mapping

The requested audit targets map to the current codebase as follows:

- `bondOrganisationService`: `src/services/bondOrganisationService.js`
- `organisationHierarchyService`: represented by `src/services/bondWorkspaceHierarchyService.js`
- `organisationMemberService`: represented by organisation membership reads in `src/services/workspaceResolutionService.js`, `src/services/bondWorkspaceHierarchyService.js`, and `src/services/bondOrganisationService.js`
- `permissionResolver`: `src/auth/permissions/permissionResolver.js`
- `organisationRoleResolver`: represented by `src/services/roleResolutionService.js` and bond aliases in `permissionResolver`
- `workspaceScopeResolver`: represented by `workspaceResolutionService`, `bondWorkspaceHierarchyService`, and now the canonical `src/services/bondOrganisationScopeResolver.js`

## Current Permission Chain

1. `workspaceResolutionService` loads active `organisation_users` membership rows and normalizes them into `currentMembership`.
2. `roleResolutionService.resolveWorkspaceRole()` normalizes `workspace_role`, `organisation_role`, or `role`.
3. `permissionResolver.resolvePermissionContext()` resolves:
   - `workspaceType`
   - `workspaceRole` / `organisationRole`
   - `scopeLevel`
   - `regionId`
   - `workspaceUnitId`
4. `permissionResolver.getPermissionMap()` maps the resolved role to permission scopes from `permissionRegistry`.
5. `bondOrganisationScopeResolver.resolveBondOrganisationScope()` converts the internal permission scope into the canonical organisation level.
6. `bondOrganisationService.buildBondOrganisationSnapshot()` uses that canonical scope to expose regions, branches, consultants, applications, tabs, and empty states.

## Current Identity Rules

HQ users are identified when their internal `scope_level` resolves to `workspace_hq`.
Typical roles: `owner`, `director`, `hq_manager`, `manager`, `compliance`.

Region users are identified when `scope_level = region` and `region_id` is set.
Typical role: `regional_manager`.

Branch users are identified when `scope_level = branch` or `scope_level = team` and `workspace_unit_id` is set.
Typical roles: `branch_manager`, `team_lead`.

Consultants are identified when `scope_level = assigned`.
Typical roles: `consultant`, `bond_originator`, `processor`, `admin_staff`.

## Canonical Hierarchy

The official Bond Originator hierarchy is:

```text
HQ
 └─ Region
      └─ Branch
            └─ Consultant
```

Every user resolves to exactly one canonical `organisationLevel`:

- HQ Manager: `hq`
- Regional Manager: `region`
- Branch Manager: `branch`
- Consultant: `consultant`

The internal permission scope remains compatible with existing RLS and permission code:

- `hq` maps to `workspace_hq`
- `region` maps to `region`
- `branch` maps to `branch` or `team`
- `consultant` maps to `assigned`

## Canonical Scope Resolver

`resolveBondOrganisationScope(context, data)` returns:

```js
{
  scopeLevel: 'hq',
  organisationLevel: 'hq',
  permissionScopeLevel: 'workspace_hq',
  regionIds: 'ALL',
  branchIds: 'ALL',
  consultantIds: 'ALL'
}
```

Region users return their single assigned region plus branch and consultant IDs derived from hierarchy rows and application rows.

Branch users return their assigned branch and consultants in that branch.

Consultants return only their own user ID in `consultantIds`.

## Phase 1 Visibility Matrix

HQ:

- Regions
- Branches
- Consultants
- Partners
- Reports
- Applications

Region Manager:

- Branches
- Consultants
- Applications

Branch Manager:

- Consultants
- Applications

Consultant:

- Applications

## Diagnostic Logging

In development only, `logBondOrganisationScope()` prints:

```text
Bond Organisation Scope
-----------------------
User:
Role:
Scope:
Regions:
Branches:
Consultants:
```

This log is emitted from `buildBondOrganisationSnapshot()` after hierarchy and application rows are available.
