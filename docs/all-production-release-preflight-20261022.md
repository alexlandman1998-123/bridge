# Full production release preflight — 22 October 2026

Status: **blocked before production changes**. The requester authorised all
outstanding edits and migrations for production. No migration, deployment,
Edge Function publication or customer-data write was performed by this preflight.

## Database scope

Target: Arch9 SaaS, `isdowlnollckzvltkasn`.

The live ledger has 1,550 versions; the checkout has 1,540 migration files.
The sole pending local version is
`20261022132550_marketing_campaign_initiatives.sql`. Its two tables remain absent
in production, explaining the Campaigns unavailable screen.

Eleven already-applied production versions are absent from this checkout.
The normal linked dry run refuses this mismatch. Production history was fetched
read-only into an isolated temporary workspace, and only the pending Campaigns
migration was added to it. The resulting linked dry run with `--skip-vault`
passed and listed exactly that migration, with empty seeds and roles. No original
migration or remote ledger entry was edited or repaired.

The isolated workspace path is recorded privately in
`/tmp/arch9-full-release-db-candidate-path`. Scope and source hashes are retained
under `output/all-production-release-20261022/`; generated output, environments,
private evidence, dependencies and the separate Only Realty checkout are excluded
from the source inventory. Recheck hashes before release because the shared
checkout remains active.

## Checks

- `npm run supabase:guard`: passed target inventory; no duplicate timestamps.
- `npm run supabase:push:lock-recovery`: **RECOVERY_LOCK_BLOCKED**.
- `npm run check:app`: passed lint, established baseline and production build;
  existing lint and build warnings remain.
- `npm run check:website`: passed typecheck, tests and build.
- `npm run check:admin`: passed production build.
- `npm --prefix apps/samlin run build`: passed, including TypeScript validation.
- Isolated Campaigns database check: passed permissions, agency isolation,
  revision guards, activity linking and preservation of underlying sends.
- Campaign/service/dashboard/navigation suites: 23 tests passed.

## Release gate

Live recovery verification found eight physical backups and PITR disabled.
The recorded historical exercise is a live clone, not a restore from an
identified backup. Blockers remain `recovery_test_not_recorded` and
`backup_restore_not_proven`. Recovery evidence has not been falsified or marked
complete. Docker is unavailable and the host has less than the runbook's 10 GiB
free-space prerequisite for local full migration replay.

The earlier user exception was explicitly scoped to the agency-email release,
which has completed. It does not authorise bypassing this gate for the new full
release. A completed isolated backup restore or an explicit exception for this
release is needed before database mutation. Follow
`docs/database-release-runbook.md`: apply the exact reviewed migration before
dependent application publication; retain current production fixes and deployment
identities, verify key objects/RLS and the live Campaigns route after release.

This preflight records local build readiness and the exact migration scope. It
does not certify a completed production rollout or authenticated live acceptance.
