# Supabase RLS Phase 6 - Local Closeout

Generated: 2026-08-14

## Status

Phase 6 is implemented locally and has not been applied to staging or production.

## Scope

Phase 6 closes the local policy design package for the eight tables classified in Phase 0:

- `public.bond_rls_cutover_exclusions`
- `public.matter_number_sequences`
- `public.transaction_commissions`
- `public.transaction_document_requirements`
- `public.transaction_lifecycle_workflows`
- `public.transaction_rollup_validation`
- `public.workspace_regions`
- `public.workspace_units`

## Implementation

Closeout test:

- `scripts/rls-phase6-closeout.test.mjs`
- `npm run test:rls-phase6-closeout`

The closeout test verifies:

- Phase 0 scope still matches the original eight-table advisor list.
- Phases 1-5 cover every Phase 0 table exactly once.
- Each phase has a migration, report, npm script, and contract test.
- Each phase migration enables RLS on its assigned table or tables.
- Each phase report states that staging/production apply has not happened yet.
- Phase 1-5 contract tests all pass.
- The RLS migrations do not use `auth.role()`, broad `to authenticated using (true)`, or anon policies.

## Phase Map

| Phase | Scope | Migration |
| --- | --- | --- |
| Phase 1 | Internal controls: `matter_number_sequences`, `bond_rls_cutover_exclusions` | `20260814163310_rls_phase1_internal_controls.sql` |
| Phase 2 | Workspace hierarchy: `workspace_regions`, `workspace_units` | `20260814163832_rls_phase2_workspace_hierarchy.sql` |
| Phase 3 | Transaction read/state models: `transaction_document_requirements`, `transaction_lifecycle_workflows` | `20260814164152_rls_phase3_transaction_read_models.sql` |
| Phase 4 | Financial commissions: `transaction_commissions` | `20260814164526_rls_phase4_transaction_commissions.sql` |
| Phase 5 | Diagnostics: `transaction_rollup_validation` | `20260814164904_rls_phase5_rollup_validation_diagnostics.sql` |

## Verification

Passing local verification:

```bash
npm run test:rls-phase6-closeout
```

This command also executes the Phase 1-5 contract tests.

## Staging Handoff

The next step is to apply the RLS migrations to staging only, then capture the evidence listed in each phase report:

- `docs/supabase-rls-phase-1-internal-controls-report.md`
- `docs/supabase-rls-phase-2-workspace-hierarchy-report.md`
- `docs/supabase-rls-phase-3-transaction-read-models-report.md`
- `docs/supabase-rls-phase-4-transaction-commissions-report.md`
- `docs/supabase-rls-phase-5-rollup-validation-diagnostics-report.md`

Production should only follow after all staging gates pass and the Supabase advisor no longer reports the original eight RLS-disabled tables.
