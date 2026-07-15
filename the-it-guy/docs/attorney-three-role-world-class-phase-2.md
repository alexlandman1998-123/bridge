# Attorney three-role world-class programme — Phase 2 persona and lane isolation

Phase 2 makes cancellation counsel a first-class attorney-firm persona and closes the temporary shared-lane editing path.

## Cancellation persona

The firm taxonomy now supports:

- `cancellation_attorney` as a member, invitation and profile attorney role;
- `cancellation` as a firm department;
- a dedicated cancellation permission pair: `can_view_cancellation_matters` and `can_edit_cancellation_workflow`;
- cancellation-specific onboarding, department selection, team invitations and assignment filtering; and
- cancellation attorneys as the valid primary professionals for cancellation assignments.

Transfer attorneys are no longer accepted as the normal primary cancellation persona. Firm directors and admins retain their management assignment capability.

## Lane isolation

The Phase 1 compatibility switch that allowed any attorney with matter access to edit every legal lane has been removed.

Workflow mutation, document operations and signing operations now require `canActOnLane`, which resolves the exact transaction role assignment. Managers remain able to view and coordinate a firm matter, add management notes and publish when authorised, but they may mutate a legal lane only where the firm's explicit `allow_management_lane_override` setting is enabled.

The database migration mirrors this boundary through `bridge_can_mutate_attorney_lane_phase2`. Lane history, lane updates and workflow blockers require an active assignment for the same `attorney_role`. A firm lead only receives the server-side override when the firm setting is enabled.

## Database rollout

Migration `202607150015_attorney_three_role_persona_permissions_phase2.sql`:

- expands department, member, invitation and profile constraints;
- creates an inactive cancellation department for existing active firms;
- introduces cancellation-aware department activation and onboarding RPC versions; and
- replaces the three workflow mutation policies with role-scoped checks.

The migration is additive and does not automatically change existing staff roles or activate cancellation departments.

## Verification

```bash
npm run test:attorney-three-role-phase2
```

The suite includes all Phase 0 and Phase 1 checks, then verifies the persona taxonomy, onboarding routing, assignment eligibility, removal of shared editing, SQL constraints and server-side lane isolation.
