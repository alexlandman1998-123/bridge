# Supabase RLS Phase 5 - Rollup Validation Diagnostics

Generated: 2026-08-14

## Status

Phase 5 is implemented locally and has not been applied to staging or production.

## Scope

Phase 5 covers the final table classified in Phase 0:

- `public.transaction_rollup_validation`

## Implementation

Migration:

- `supabase/migrations/20260814164904_rls_phase5_rollup_validation_diagnostics.sql`

Contract test:

- `scripts/rls-phase5-rollup-validation-diagnostics.test.mjs`
- `npm run test:rls-phase5-rollup-validation-diagnostics`

## Controls

### Table Access

- Enables row level security.
- Removes `public`, `anon`, and broad authenticated table grants.
- Re-adds only authenticated `select`.
- Preserves `service_role` table access.
- Adds no authenticated direct insert, update, or delete policy.

### Read Policy

Authenticated reads are allowed only through:

- `public.bridge_can_read_transaction_rollup_validation()`

The helper is limited to platform/HQ diagnostic users by checking:

- `public.profiles.system_role`
- `public.profiles.role`
- JWT `app_metadata.role`

It intentionally does not use `user_metadata`, because user metadata is user-editable and should not drive authorization.

### Write Path

Direct browser writes are blocked. Validation job writes remain service-role owned.

## Verification

Passing local verification:

```bash
npm run test:rls-phase1-internal-controls
npm run test:rls-phase2-workspace-hierarchy
npm run test:rls-phase3-transaction-read-models
npm run test:rls-phase4-transaction-commissions
npm run test:rls-phase5-rollup-validation-diagnostics
```

## Apply Gates

Before recording this phase as applied, run it against staging first and capture evidence for:

- Supabase advisor no longer reports RLS disabled on `transaction_rollup_validation`.
- Anon cannot read diagnostic rows.
- Ordinary authenticated non-admin users cannot read diagnostic rows.
- Platform/HQ diagnostic users can read diagnostic rows.
- Direct authenticated insert/update/delete is blocked.
- Validation jobs using service-role credentials can still insert/update diagnostic snapshots.

After Phase 5 applies and passes staging evidence, the original eight-table RLS-disabled advisor list should be closed.

Production should only follow after staging evidence passes.
