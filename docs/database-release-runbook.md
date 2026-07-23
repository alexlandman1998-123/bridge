# Database Release Runbook

## Current safety state

Broad linked-database pushes remain frozen while historical migration drift exists. Do not override the Phase 0 guard and do not use `--include-all`.

Before every release, run:

```bash
npm run supabase:phase5
```

The report must show zero duplicate local timestamps. A migration that appears local-only is not automatically safe to apply: it may already be live, partially live, or genuinely absent.

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

For token-scoped Storage policy changes, deploy the client header support before enforcing the policy, then smoke-test a real seller session and an anonymous buyer portal token for upload, signed download, and rejected cross-scope access.

## Historical reconciliation

Process one product module at a time:

- All declared objects live: run module behavior tests, then repair ledger only.
- No objects live: dependency-check, apply the migration, verify, then repair ledger.
- Partially live: write a new corrective migration; do not replay the original blindly.
- Data-only/no-static-object migration: manually verify the intended data outcome.
- Split version: keep it out of normal batches until the split-row investigation is resolved.

### Reviewed split baseline

The 17 versions recorded in `docs/supabase-migration-phase-6-split-ledger-investigation-report.md` are reviewed CLI ordering artifacts caused by an applied minute-level migration sharing a filename prefix with an applied second-level migration. Both versions must retain their original filenames. Do not rename either file and do not run `migration repair` for these rows.

Phase 6 must report `SPLIT_BASELINE_READY`, and Phase 5 must report zero unreviewed split versions, before selecting a pure local-only module batch. A newly observed split version is not covered by this baseline and blocks its module until investigated.

After each module batch, regenerate the Phase 5 report and retain deployment evidence in `docs/`.

### Pure local-only application manifest

Phase 5 generates a conservative manifest for every pure local-only migration. Its actions mean:

- `repair_only_after_smoke`: all extracted objects are live; run behavior tests before recording only that version as applied.
- `corrective_migration_required`: the migration is partially live; do not replay it. Produce an idempotent corrective migration from the live diff.
- `apply_original_after_dependency_check`: extracted objects are absent; verify the stream prerequisites in staging before applying that file alone.
- `manual_data_review`: static catalog extraction is insufficient; verify the intended data outcome and idempotency manually.

The manifest is planning evidence, not deployment authorization. Process one dependency stream at a time and retain a checkpoint after every migration.

### Staging execution gate

Use `scripts/supabase-phase6-staging-execution.mjs` for manifest-driven staging work. It must target an explicit non-production `SUPABASE_STAGING_DB_URL`; never relink this working directory to staging. Apply SQL and record the ledger in separate invocations so verification evidence is reviewed between them. The runner intentionally refuses batch mutation, production targets, corrective/manual rows, and ledger recording without passing evidence.

### Production promotion gate

Use `scripts/supabase-phase7-production-execution.mjs` only after the exact version has passed staging and its staging ledger is recorded. Production mutations require the fixed production project identity, an identity-matching database URL, explicit recovery confirmation, and a live CLI check proving PITR or at least one physical backup exists. The runner handles one exact version per invocation, enforces recorded stream dependencies, and separates SQL application from ledger recording.

Every production invocation requires reviewed staging evidence. Ledger recording additionally requires production evidence proving the target state and catalog, behavior, and rollback/no-residue checks. Corrective and manual-review rows remain outside this runner; `repair_only_after_smoke` can be ledger-recorded with evidence but can never replay SQL.

### Reconciliation closeout gate

Use `scripts/supabase-phase8-closeout.mjs` to prove steady-state readiness after production promotion. Add one reviewed row to `docs/supabase-phase-8-closeout-evidence.json` for each Phase 5 manifest version only after staging and production ledger recording, target-state verification, catalog and behavior checks, and rollback/no-residue checks all pass.

The live closeout verifies zero duplicate timestamps, zero missing manifest files, zero pure local-only or remote-only versions, zero divergent or unreviewed split versions, complete evidence, and production PITR or a physical backup. It never removes the Phase 0 guard. A passing result makes guard retirement eligible for a separate reviewed change.

## Target steady state

Once Phase 8 reports `READY_FOR_REVIEWED_PHASE0_FREEZE_RETIREMENT`:

1. Remove the Phase 0 broad-push freeze through a reviewed change.
2. Add CI that runs a migration-list/dry-run gate on every database-affecting pull request.
3. Apply migrations to staging first.
4. Require an approval gate before production.
5. Verify the production ledger before deploying dependent frontend code.
6. Enable PITR or confirm an equivalent managed backup policy for production.
