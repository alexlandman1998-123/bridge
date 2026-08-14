# Supabase RLS Phase 2 - Workspace Hierarchy

Generated: 2026-08-14

## Status

Phase 2 is implemented locally and has not been applied to staging or production.

## Scope

Phase 2 covers the workspace hierarchy reference tables classified in Phase 0:

- `public.workspace_regions`
- `public.workspace_units`

## Implementation

Migration:

- `supabase/migrations/20260814163832_rls_phase2_workspace_hierarchy.sql`

Contract test:

- `scripts/rls-phase2-workspace-hierarchy.test.mjs`
- `npm run test:rls-phase2-workspace-hierarchy`

## Controls

### Shared Controls

- Enables row level security.
- Removes `public`, `anon`, and previous broad authenticated table grants.
- Re-adds only authenticated `select`, `insert`, and `update`.
- Preserves `service_role` table access.
- Adds no authenticated delete policy.

### `public.workspace_regions`

- Active members can read regions for their own workspace.
- Hierarchy managers/admins can insert regions for their own workspace.
- Hierarchy managers/admins can update regions for their own workspace with both `USING` and `WITH CHECK`.

### `public.workspace_units`

- Active members can read units for their own workspace.
- Hierarchy managers/admins can insert and update units for their own workspace.
- Insert/update policies require the referenced region and parent unit to belong to the same workspace.

## Helpers

- `public.bridge_can_manage_workspace_hierarchy(uuid)` combines existing hierarchy/admin checks:
  - `public.bridge_phase5_can_manage_hierarchy(uuid)`
  - `public.bridge_has_workspace_permission(uuid, 'manage_branches')`
  - `public.bridge_is_org_admin(uuid)`
- `public.bridge_workspace_unit_hierarchy_shape_is_valid(uuid, uuid, uuid)` prevents cross-workspace hierarchy links.

Both helpers revoke public/anon execute access and grant only authenticated/service-role execution.

## Verification

Passing local verification:

```bash
npm run test:rls-phase2-workspace-hierarchy
```

## Apply Gates

Before recording this phase as applied, run it against staging first and capture evidence for:

- Supabase advisor no longer reports RLS disabled on `workspace_regions` and `workspace_units`.
- A workspace member can read only regions/units for their workspace.
- A member from another workspace cannot read those rows.
- A hierarchy manager/admin can insert and update a region.
- A hierarchy manager/admin can insert and update a unit.
- Non-manager workspace members cannot insert or update hierarchy rows.
- A unit cannot be inserted or updated with a `region_id` or `parent_unit_id` from another workspace.
- Authenticated hard delete remains blocked for both tables.

Production should only follow after staging evidence passes.
