# Supabase Phase 0 Implementation Status

Generated: 2026-07-20
Linked project: `isdowlnollckzvltkasn` (`Arch9 SaaS`)

## Decision

**Status: INVENTORY_STABILISED — CONTROLLED_STAGING_ROLLOUT_ENABLED**

The Phase 0 repository freeze is implemented and regression-tested. The migration inventory is reconciled, production has completed physical backups, and a production-backup restore created the dedicated `Arch9 Staging` project. Broad migration commands remain blocked; reviewed migrations may now proceed one at a time through the staging evidence gate.

## Implemented Controls

- `supabase db push`, `supabase db reset`, and `supabase migration repair` are blocked by `scripts/supabase-phase0-guard.mjs` unless the documented explicit override is present.
- The guard correctly distinguishes its own `--status` command from Supabase's `migration repair --status ...` option. This closes a bypass found during Phase 0 verification.
- `scripts/supabase-phase0-guard.test.mjs` verifies blocked commands, allowed read-only diagnostics, and explicit override behavior.
- `.github/workflows/supabase-phase0-guard.yml` runs the regression test for migration- and guard-related pull requests and pushes to `main`.
- Pull requests that add migration files are rejected during the freeze. A release owner can use the `database-reconciliation` label only for reviewed history restoration or a corrective migration.
- No production database writes were performed during this verification pass.
- Staging mutations require an explicit non-production project identity, recoverability confirmation, a single manifest version, and separate SQL/application-ledger steps.

## Current Operational Evidence

| Check | Result | Decision |
| --- | --- | --- |
| Linked project health | `ACTIVE_HEALTHY` | Pass |
| Physical backup mechanism | `walg_enabled: true` | Pass |
| PITR | `pitr_enabled: false` | Daily physical backups used instead |
| Available physical backups | 8 completed backups returned; newest `2026-07-20T03:09:30.071Z` | Pass |
| Recovery rehearsal | Production backup restored into `Arch9 Staging` | Pass |
| Active staging project | `vaszuxjeoajeuhlcnzzf`; database connection verified | Pass |
| Local migration files | 497 | Informational |
| Duplicate migration versions | 0 | Pass |
| Matched local/remote rows | 416 | Pass |
| Reviewed split versions | 17; all remote names matched | Pass |
| Unreviewed split versions | 0 | Pass |
| Pure remote-only rows | 0 | Pass |
| Pure local-only reviewed actions | 64 | Controlled rollout required |
| Onboarding-critical local files | Present | Pass |

Canonical live reports:

- `docs/supabase-migration-phase-5-module-drift-report.md`: `MODULE_AUDIT_READY`
- `docs/supabase-migration-phase-6-split-ledger-investigation-report.md`: `SPLIT_BASELINE_READY`

## Required Release-Owner Actions

1. Keep database credentials in ignored local environment files; never commit them.
2. Apply one reviewed manifest version to staging at a time.
3. Capture catalog, behavior, permission, and rollback/no-residue evidence before recording each staging ledger row.
4. Promote only staging-approved versions to production under the production recovery and evidence gates.
5. Keep the Phase 0 broad-push guard active until Phase 8 proves zero remaining drift and a separate reviewed change retires the freeze.

Do not use the Phase 0 override to compensate for missing recovery or staging controls.
