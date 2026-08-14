# Auth Bridge Release And Monitor

## Scope

This release stabilizes the workspace boot path behind the banner:

`Workspace data is refreshing from the last successful session while Arch9 reconnects to the backend.`

It ships the UI retry behavior, app query drift patches, additive backend compatibility columns, and hot-path indexes.

## Preflight

Run:

```bash
npm run verify:auth-bridge-release
npm run build:guarded
```

Both commands must pass before production promotion.

## Apply Order

1. Apply Supabase migration `202608140004_backend_drift_compatibility_columns.sql`.
2. Apply Supabase migration `202608140005_performance_hardening_hot_path_indexes.sql`.
3. Confirm PostgREST schema reload has completed.
4. Deploy the Vercel frontend from the verified source revision.
5. Confirm `/release-manifest.json` is reachable and matches the deployed HTML release marker.

## Monitor

Run after release, then again at 15, 30, and 60 minutes:

```bash
npm run monitor:auth-bridge-release -- --window-minutes=60
```

The monitor blocks release continuation when any of these are true:

- `auth_boot_degraded` rate is above 1%.
- Auth error rate is above 3%.
- Any workspace resolution timeout is observed.
- Any schema drift or missing-column signature is observed.
- Workspace boot p95 is above 2500 ms.

## Rollback Signal

Rollback the frontend or pause rollout when the monitor reports blockers after the migrations are confirmed live. The migrations are additive and forward-only; rollback should target the frontend deployment while preserving the compatibility columns and indexes.
