# Supabase RLS Phase 7 - Staging Execution Gate

Generated: 2026-08-14

## Status

Phase 7 staging execution is complete and has not been applied to production.

## Purpose

Phase 6 proved the local RLS package is internally consistent. Phase 7 prepares the staging-only handoff that must happen before any production promotion:

- Run Phase 6 closeout immediately before staging execution.
- Verify the active Supabase target is staging project `vaszuxjeoajeuhlcnzzf`.
- Apply the Phase 1-5 RLS migrations to staging in timestamp order.
- Capture evidence for RLS enablement, negative browser write probes, required backend/RPC workflows, and the Supabase advisor result.

## Production Guard

Do not run against production in Phase 7.

The local Supabase CLI was previously linked to production project `isdowlnollckzvltkasn`. The active link was verified as staging project `vaszuxjeoajeuhlcnzzf` before SQL execution. Phase 7 applied the RLS SQL package only to staging.

## Artifacts

- `docs/supabase-rls-phase-7-staging-execution.json`
- `docs/staging-evidence/supabase-rls-phase-7-staging-execution.json`
- `scripts/rls-phase7-staging-execution.test.mjs`
- `npm run test:rls-phase7-staging-execution`

## Phase Map

| Phase | Scope | Migration |
| --- | --- | --- |
| Phase 1 | Internal controls: `matter_number_sequences`, `bond_rls_cutover_exclusions` | `20260814163310_rls_phase1_internal_controls.sql` |
| Phase 2 | Workspace hierarchy: `workspace_regions`, `workspace_units` | `20260814163832_rls_phase2_workspace_hierarchy.sql` |
| Phase 3 | Transaction read/state models: `transaction_document_requirements`, `transaction_lifecycle_workflows` | `20260814164152_rls_phase3_transaction_read_models.sql` |
| Phase 4 | Financial commissions: `transaction_commissions` | `20260814164526_rls_phase4_transaction_commissions.sql` |
| Phase 5 | Diagnostics: `transaction_rollup_validation` | `20260814164904_rls_phase5_rollup_validation_diagnostics.sql` |

## Staging Gates

- Phase 6 closeout passes. Complete.
- Active target is confirmed as staging project `vaszuxjeoajeuhlcnzzf`. Complete.
- All five RLS migrations are applied in timestamp order. Complete.
- All eight Phase 0 tables have RLS enabled after apply. Complete.
- Browser/authenticated direct write probes fail where the policy design requires them to fail. Complete.
- Service-role or controlled RPC workflows still pass for required backend paths. Complete.
- Supabase advisor no longer reports the original eight public RLS-disabled tables. Complete for the eight target tables.

## Verification

Passing local verification:

```bash
npm run test:rls-phase7-staging-execution
```

This command also executes the Phase 6 closeout contract, which executes the Phase 1-5 contract tests.

## Remote Apply Status

- Staging: execution complete.
- Production: not applied.
