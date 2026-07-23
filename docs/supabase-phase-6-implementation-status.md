# Supabase Phase 6 Implementation Status

Generated: 2026-07-19
Production project: `isdowlnollckzvltkasn` (`Arch9 SaaS`)

## Decision

**Status: STAGING_EXECUTION_GATE_READY — NO_STAGING_TARGET**

Phase 6 implements the staging execution mechanism for the 63-row Phase 5 manifest. No migration was applied because no active Arch9 staging project, staging database URL, or tested staging recovery confirmation is configured.

The runner is deliberately unable to target the production project.

## Implemented Controls

- Phase 5 writes `docs/supabase-phase-5-application-manifest.json` for machine-readable execution planning.
- `scripts/supabase-phase6-staging-execution.mjs` targets only an explicitly configured non-production database through `--db-url`.
- The production project reference `isdowlnollckzvltkasn` is hard-blocked.
- Staging mutations require a PostgreSQL URL whose host is exactly `db.<declared-staging-project-ref>.supabase.co` on the direct database port, database path is `/postgres`, and exactly one `sslmode` is explicitly `require`, `verify-ca`, or `verify-full`; project references in a password, query string, or path, duplicate TLS values, and all URI connection overrides are rejected.
- Mutating calls use the pinned `supabase@2.109.1` CLI rather than `@latest`.
- Staging mutations require explicit recovery confirmation and `--confirm APPLY_TO_STAGING_ONLY`.
- Only one exact migration version can be mutated per invocation.
- SQL application and migration-ledger recording are separate operations.
- `corrective_migration_required` and `manual_data_review` rows cannot be replayed or ledger-recorded by the runner.
- Ledger recording requires a reviewed JSON evidence file with passing catalog, behavior, and rollback/no-residue checks.
- The legal-document Phase 1 versions (`202607220002`–`202607220012` plus `202607230004`) additionally require the committed pending Phase 1 receipt and its exact digest. The runner verifies the Phase 0/B1 identities, clean receipt-only source continuity, direct staging target, migration hash, and ledger predecessor before it invokes the Supabase CLI.

## Current Operational Evidence

| Check | Result |
| --- | --- |
| Active Arch9 staging project | Not identified |
| `SUPABASE_STAGING_PROJECT_REF` | Unset |
| `SUPABASE_STAGING_DB_URL` | Unset |
| `SUPABASE_STAGING_RECOVERY_CONFIRMED` | Unset |
| Production status | `ACTIVE_HEALTHY` |
| Production PITR | Disabled |
| Production physical backups returned | None |
| Staging SQL applied | No |
| Remote migration ledger changed | No |

The only other accessible Supabase project is inactive and named `Yakstack MVP v2`; it is not treated as Arch9 staging.

## Usage

Review a stream without connecting to a database:

```bash
npm run supabase:phase6:staging -- --stream settings_governance
```

After provisioning a recoverable staging project, configure the environment without committing credentials:

```bash
export SUPABASE_STAGING_PROJECT_REF='<staging-project-ref>'
export SUPABASE_STAGING_DB_URL='<percent-encoded-staging-postgres-url>'
export SUPABASE_STAGING_RECOVERY_CONFIRMED='I_HAVE_A_RECOVERABLE_STAGING_BACKUP'
```

Apply one eligible SQL file without changing the ledger:

```bash
node scripts/supabase-phase6-staging-execution.mjs \
  --apply-sql \
  --version 202607170026 \
  --confirm APPLY_TO_STAGING_ONLY
```

Run the migration-specific catalog, RLS, RPC, trigger, data, and behavior checks. Record the evidence in a JSON file shaped like:

```json
{
  "version": "202607170026",
  "targetProjectRef": "<staging-project-ref>",
  "sqlApplied": true,
  "catalogChecks": "pass",
  "behaviorChecks": "pass",
  "rollbackOrNoResidue": "pass",
  "reviewedBy": "<reviewer>"
}
```

Only after review, record the exact staging ledger version:

```bash
node scripts/supabase-phase6-staging-execution.mjs \
  --record-applied \
  --version 202607170026 \
  --evidence '<evidence-file>.json' \
  --confirm APPLY_TO_STAGING_ONLY
```

## Handoff

1. Provision or identify a dedicated Arch9 staging Supabase project.
2. Establish and test staging recovery.
3. Set the three staging environment variables locally or through a secure secret store.
4. Begin with a single reviewed version from the smallest approved stream.
5. Stop after SQL application until its evidence file passes review.

Production application remains out of scope until staging completes and production recovery controls are available.

For legal-document Phase 1, this generic runner remains held until the actual production project reference is recorded in Phase 0 and reconciled with both this guard and the application manifest. Do not treat the historical `isdowlnollckzvltkasn` label as a staging target.
