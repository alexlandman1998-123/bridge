# Supabase Phase 21: Staging Train Execution

Generated: `2026-07-29T19:45:00Z`

## Scope

Phase 21 attempted to execute the current staging train using the Phase 6 staging runner. No SQL was applied and no staging ledger rows were recorded because no non-production staging target is configured in this shell.

## Effective Train

| Field | Value |
| --- | ---: |
| Effective runner rows | 32 |
| SQL apply rows | 26 |
| Repair-only rows | 6 |
| Blocked rows | 0 |
| First SQL row | `202607270015` |
| First repair-only row | `202607270013` |

This differs from the older 29-row wording because Phase 20 cleared the three blocked rows. The historical `202607270012` row is replaced by corrective migration `202607290005`, so the effective train remains 32 rows.

## Execution Attempt

Command attempted:

```bash
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607270015 --confirm APPLY_TO_STAGING_ONLY
```

Result:

```text
Phase 6 staging gate blocked: SUPABASE_STAGING_PROJECT_REF is required.
```

## Staging Target State

| Variable | State |
| --- | --- |
| `SUPABASE_STAGING_PROJECT_REF` | unset |
| `SUPABASE_STAGING_DB_URL` | unset |
| `SUPABASE_STAGING_RECOVERY_CONFIRMED` | unset |

Only `.env.production.local` exists locally. The runner correctly refuses to use the linked production project or production env for staging execution.

## Required Before Execution

Configure a real non-production Supabase staging target:

```bash
export SUPABASE_STAGING_PROJECT_REF='<staging-project-ref>'
export SUPABASE_STAGING_DB_URL='postgresql://postgres:<password>@db.<staging-project-ref>.supabase.co:5432/postgres?sslmode=require'
export SUPABASE_STAGING_RECOVERY_CONFIRMED='I_HAVE_A_RECOVERABLE_STAGING_BACKUP'
```

Then run the train one version at a time from `docs/supabase-push-phase-3-action-routing-report.md`.

For SQL rows:

```bash
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version <version> --confirm APPLY_TO_STAGING_ONLY
```

After catalog, behavior, and rollback/no-residue checks pass:

```bash
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version <version> --evidence docs/staging-evidence/<version>-<stream>.json --confirm APPLY_TO_STAGING_ONLY
```

For repair-only rows, do not apply SQL. Run the smoke checks first, then record the staging ledger with evidence:

```bash
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version <version> --evidence docs/staging-evidence/<version>-<stream>.json --confirm APPLY_TO_STAGING_ONLY
```

## Phase 21 Outcome

Status: `BLOCKED_STAGING_TARGET_NOT_CONFIGURED`

The staging train is ready to execute, but execution is intentionally blocked until a real staging project reference, staging database URL, and staging recovery confirmation are supplied.
