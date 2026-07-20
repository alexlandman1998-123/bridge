# Attorney Role Security Phase 1

## Outcome

Phase 1 changes attorney authorization from compatibility-first to fail-closed behavior. An active persisted firm membership is now required before attorney operational or management data is loaded, and workflow actions are resolved from firm-role permissions, lane participation, explicit management override, and assignment-level capability flags together.

## Membership hardening

- Removed synthetic firm-admin membership from the permission hook and operations service.
- Removed owner/admin recovery rows when firm-member reads are denied by RLS.
- Removed owner-created synthetic membership from the management dashboard.
- Removed profile/auth `attorney_role` fallbacks from operations and incoming-matter authorization.
- Unknown firm roles now resolve to an all-false permission record.
- Missing, suspended, removed, unknown, or unreadable memberships return blocked/empty operational data.
- Initial firm-admin creation now runs only through `bootstrap_attorney_firm_admin_membership`; direct client upsert and synthetic fallback are not used.
- Explicit attorney demo context remains isolated behind the existing demo-environment switch.

## Workflow authorization formula

Attorney actions now require:

1. Attorney application role.
2. Active persisted attorney firm membership.
3. Matter visibility.
4. Active lane participation or an enabled management override.
5. Firm-role permission for the requested action.
6. Assignment-level capability not explicitly disabled.

Lane editing additionally requires the matching transfer/bond workflow permission, except for an explicitly enabled management override or the primary transfer attorney controller path. Cancellation uses the transfer workflow permission until the canonical qualification model is introduced.

## Transfer attorney controller rule

Transfer, bond, and cancellation stay separate transaction legal roles with separate workflow views. The primary transfer attorney is the legal process controller for the transaction and should be able to operate the `transfer`, `bond`, and `cancellation` lanes on that transaction.

This authority is one-way. Bond attorneys and cancellation attorneys can operate their own assigned lanes, but do not receive transfer-lane or cross-lane control by default.

Controller actions should be audited separately from direct lane-assigned attorney actions and management override actions, for example with `actorAuthority: transfer_attorney_controller`.

## Assignment-level controls enforced

- `can_manage_documents`
- `can_manage_signing`
- `can_update_workflow_lane`
- `can_add_internal_notes`
- `can_add_shared_updates`

Support roles retain only their declared capabilities. For example, candidates may upload and add internal notes when assigned, reception may schedule signing when assigned, and admin staff may manage documents when assigned; none receives general lane-edit authority.

## Management behavior

- Firm administrators and director/partners may view firm-wide matters according to their role permissions.
- Firm-wide dashboard data is loaded only after active management membership is verified.
- Unassigned management users cannot perform lane actions unless `allow_management_lane_override` is enabled.
- Assignment administration continues to require the existing create/update assignment permissions.

## Verification

Run:

```bash
npm run test:attorney-role-security-phase1
npm run test:attorney-role-governance-phase0
```

The Phase 1 suite covers valid transfer operations, cross-lane denial except for the planned primary transfer attorney controller path, candidate/reception/admin capabilities, missing and suspended membership, unassigned users, assignment-level restrictions, management override behavior, unknown roles, non-attorney app users, and source-level removal of synthetic fallbacks.

The production build, targeted ESLint, onboarding safety checks, dashboard checks, attorney workflow phases 1–4, document requirements, readiness, communication control, transaction-role normalization, and incoming-matter queue tests also pass.

## Deferred work

Phase 1 does not consolidate the duplicate role registries, migrate membership storage, change signup contracts, or replace generic Settings team management. Those remain assigned to the later catalogue, data-model, signup, and Settings phases.
