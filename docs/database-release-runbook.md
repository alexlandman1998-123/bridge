# Database Release Runbook

## Current safety state

Broad linked-database pushes remain frozen while historical migration drift exists. Do not override the Phase 0 guard and do not use `--include-all`.

Before every release, run:

```bash
npm run supabase:safety-check
npm run supabase:phase5
```

The report must show zero duplicate local timestamps. A migration that appears local-only is not automatically safe to apply: it may already be live, partially live, or genuinely absent.

Refresh the read-only production baseline before a reconciliation batch:

```bash
npm run supabase:phase0:evidence
```

The baseline records catalog fingerprints and the exact CLI migration ledger without application data or function bodies. Direct `db push`, `db reset`, `--include-all`, and unreviewed migration repair remain prohibited while Phase 0 is active. Pull requests that touch migration infrastructure run the same safety check in CI.

## Releasing a new database change during reconciliation

1. Generate a unique migration filename with `npx supabase migration new <name>`.
2. Confirm no duplicate version exists before writing SQL.
3. Make the migration forward-only, idempotent where practical, and transaction-wrapped.
4. Identify every referenced table, column, function, constraint, policy, trigger, and extension in the linked live catalog.
5. Capture pre-change definitions for anything replaced or dropped.
6. Prepare a scoped rollback that preserves user data.
7. Apply only the reviewed migration file with `npx supabase db query --linked --file <file>`.
8. Run live object, RLS, trigger, RPC-visibility, and rollback-only behavior checks.
9. Only after those checks pass, record that exact version with `npx supabase migration repair --linked --status applied <version>`.
10. Rerun `npm run supabase:phase5` and confirm the migration is matched.
11. Deploy frontend code that depends on the new schema only after database verification.

## Historical reconciliation

Process one product module at a time:

- All declared objects live: run module behavior tests, then repair ledger only.
- No objects live: dependency-check, apply the migration, verify, then repair ledger.
- Partially live: write a new corrective migration; do not replay the original blindly.
- Data-only/no-static-object migration: manually verify the intended data outcome.
- Split version: keep it out of normal batches until the split-row investigation is resolved.

After each module batch, regenerate the Phase 5 report and retain deployment evidence in `docs/`.

## Target steady state

Once the report has no local-only, remote-only, split, or duplicate versions:

1. Remove the Phase 0 broad-push freeze through a reviewed change.
2. Add CI that runs a migration-list/dry-run gate on every database-affecting pull request.
3. Apply migrations to staging first.
4. Require an approval gate before production.
5. Verify the production ledger before deploying dependent frontend code.
6. Enable PITR or confirm an equivalent managed backup policy for production.
