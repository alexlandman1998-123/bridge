# Supabase Migration Phase 0 Stabilization

Date started: 2026-07-12

## Purpose

The linked Supabase project has migration ledger drift. Until the ledger is reconciled, broad migration commands can misreport state, skip required objects, or attempt the wrong pending set. Phase 0 keeps production stable while the reconciliation work is prepared.

## Freeze Rule

Do not run these commands against the linked project during Phase 0:

- `npx supabase db push --linked`
- `npx supabase db reset --linked`
- `npx supabase migration repair ...`

The repo exposes a local guard:

```bash
npm run supabase:phase0
npm run supabase:db-push
```

`supabase:db-push` intentionally blocks. It exists so engineers who reach for a package script hit the Phase 0 warning before touching the linked database.

## CI Enforcement

The `Supabase Phase 0 Guard` workflow runs whenever migration files, the database release runbook, the guard, or its package wiring changes. It verifies that `db push`, `db reset`, and `migration repair` remain blocked without the documented override, while read-only diagnostics remain available. Pull requests that add migration files are blocked during the freeze unless a release owner applies the `database-reconciliation` label for reviewed history restoration or a corrective migration.

Run the same regression check locally with:

```bash
node scripts/supabase-phase0-guard.test.mjs
```

The workflow also prints the local migration state, including duplicate timestamps and missing onboarding-critical files. It does not connect to Supabase and cannot prove that backups, PITR, or a staging project are configured; those remain release-owner checks before any database write.

## Allowed Phase 0 Work

Allowed without changing data:

- `npx supabase migration list --linked`
- `npx supabase db query --linked "select ..."` for catalog checks
- REST RPC visibility probes that do not authenticate as a real user
- local migration and duplicate-timestamp audits

Allowed only for a user-facing production blocker:

- A tiny SQL patch applied with `npx supabase db query --linked --file <file>`
- The patch must be scoped to the failing function, policy, or constraint
- The patch must be followed by a live object check
- The patch must be followed by a rollback/no-residue smoke test where possible

## Evidence Checklist For Emergency Patches

Before applying:

- Identify the exact user-facing error and affected route/workflow
- Identify the exact function, policy, constraint, or table column involved
- Confirm broad `db push` is not being used
- Prepare a minimal SQL file

After applying:

- Verify the object exists in `pg_proc`, `pg_policies`, `pg_constraint`, or `information_schema`
- Probe REST RPC visibility when the object is an RPC
- Run a rollback-only smoke test if the function writes data
- Verify the smoke test left no test rows behind
- Note whether the migration ledger was updated or only the live object was patched

## Known Phase 0 Facts

- `supabase db push --linked --dry-run` currently fails because the remote ledger and local migration set do not line up.
- The app needed live patches for:
  - `bridge_complete_workspace_onboarding(payload)` branch-scope null handling
  - `bridge_create_principal_claim_invite(payload)`
  - `bridge_complete_principal_claim_onboarding(payload)`
- The principal-claim RPCs are now visible through PostgREST.
- The migration ledger still needs controlled reconciliation in Phase 1 and Phase 2.

## Phase 1 Handoff

Phase 1 is the read-only reconciliation pass:

```bash
npm run supabase:phase1:local
npm run supabase:phase1
```

`supabase:phase1:local` only scans the repo and writes the report skeleton. `supabase:phase1` also fetches the linked migration ledger and runs `sql/supabase-phase1-live-object-checks.sql`, which is catalog-only SQL.

Phase 2 is the onboarding-critical readiness pass:

```bash
npm run supabase:phase2:local
npm run supabase:phase2
```

`supabase:phase2` reruns the onboarding object catalog checks, verifies unauthenticated onboarding RPC behavior contracts, and probes PostgREST RPC visibility through the configured anon key. It should report `READY_FOR_PHASE_3` before any ledger repair.

Phase 3 is the controlled onboarding-critical ledger repair:

```bash
npm run supabase:phase3:plan
npm run supabase:phase3
```

`supabase:phase3` is the first phase that intentionally writes to the linked Supabase project. It only updates the migration history for the Phase 1/2 verified onboarding-critical migrations and then snapshots the ledger again. It does not apply migrations or change app data.

Phase 4 removes duplicate local migration timestamps:

```bash
npm run supabase:phase4
```

This phase is local-file hygiene only. It renames duplicate migration files to unused timestamp slots and writes `docs/supabase-migration-phase-4-duplicate-timestamps-report.md`. It does not touch the linked Supabase project.

Phase 5 groups the remaining ledger drift by module:

```bash
npm run supabase:phase5:local
npm run supabase:phase5
```

`supabase:phase5` is read-only. It fetches the linked migration list, classifies local-only and split rows by product area, and runs catalog-only object checks for local-only migrations. It writes `docs/supabase-migration-phase-5-module-drift-report.md`.

Phase 6 investigates the split local/remote rows from Phase 5:

```bash
npm run supabase:phase6:local
npm run supabase:phase6
```

`supabase:phase6` is read-only. It fetches the linked migration list, checks live catalog objects for split-row migrations, reads `supabase_migrations.schema_migrations` metadata, and writes `docs/supabase-migration-phase-6-split-ledger-investigation-report.md`. Split rows should stay out of repair batches until this report has been reviewed.

Phase 7 is the first small pure-local-only repair batch after split-row investigation:

```bash
npm run supabase:phase7:plan
npm run supabase:phase7
```

`supabase:phase7:plan` is read-only and verifies the canonical document verification snapshot migration is pure local-only and live. `supabase:phase7` intentionally writes one migration-history row for `202607120003_canonical_document_verification_snapshot_scoped.sql` only after the evidence gate passes. It writes `docs/supabase-migration-phase-7-canonical-ledger-repair-report.md`.

## Override

The guard can be overridden only with documented approval:

```bash
BRIDGE_SUPABASE_PHASE0_OVERRIDE=I_UNDERSTAND_LEDGER_DRIFT npm run supabase:db-push
```

Using the override does not make `db push` safe. It only records intent locally and should be reserved for the later reconciliation phases after a migration matrix has been reviewed.
