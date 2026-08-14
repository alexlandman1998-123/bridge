# Supabase RLS Phase 1 - Internal Controls

Generated: 2026-08-14

## Status

Phase 1 is implemented locally and has not been applied to staging or production.

## Scope

Phase 1 covers the two tables classified as internal control tables in Phase 0:

- `public.matter_number_sequences`
- `public.bond_rls_cutover_exclusions`

## Implementation

Migration:

- `supabase/migrations/20260814163310_rls_phase1_internal_controls.sql`

Contract test:

- `scripts/rls-phase1-internal-controls.test.mjs`
- `npm run test:rls-phase1-internal-controls`

## Controls

### `public.matter_number_sequences`

- Enables row level security.
- Removes direct `public`, `anon`, and `authenticated` table access.
- Preserves `service_role` table access.
- Removes browser-callable execute access from:
  - `public.next_matter_number(integer, text)`
  - `public.assign_transaction_matter_number()`
- Adds no browser-facing RLS policy. Matter-number mutation remains owned by trigger/function paths.

### `public.bond_rls_cutover_exclusions`

- Enables row level security.
- Removes `public` and `anon` table access.
- Allows authenticated `select`, `insert`, and `update` only through transaction-workspace admin policies.
- Keeps authenticated hard delete disabled.
- Adds `public.bridge_can_manage_bond_rls_cutover_exclusion(uuid)` as a transaction-aware admin helper.

## Verification

Passing local verification:

```bash
npm run test:rls-phase1-internal-controls
```

## Apply Gates

Before recording this phase as applied, run it against staging first and capture evidence for:

- Supabase advisor no longer reports RLS disabled on the two Phase 1 tables.
- Authenticated direct access to `public.matter_number_sequences` is blocked.
- Transaction creation still assigns matter numbers through the existing trigger/function path.
- Bond exclusion non-admin access is blocked.
- Bond exclusion transaction-workspace admins can select, insert, and update.
- Authenticated hard delete on bond exclusions remains blocked.

Production should only follow after staging evidence passes.
