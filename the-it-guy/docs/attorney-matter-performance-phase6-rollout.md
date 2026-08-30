# Attorney matter performance — Phase 6 rollout

The assignment-first matter-list RPC is guarded by `get_attorney_matter_snapshot_rollout_status`. The browser never receives a privileged key; both the status decision and the snapshot run with the signed-in attorney's RLS context.

## Release sequence

1. Deploy the Phase 3 read-model migration, then the Phase 6 rollout migration.
2. Confirm the production assignment query plan before adding the proposed assignment index. Record the `EXPLAIN (ANALYZE, BUFFERS)` result with the release evidence.
3. Run `node scripts/verify-attorney-matter-performance-phase6.mjs --live` against staging with the certification attorney credentials.
4. Confirm the Matters list and a matter-detail route meet the Phase 1 timing budgets in `performance_metrics`.
5. Obtain explicit production approval, then update the production rollout row from `0` to a small cohort. Observe budgets and errors before each increase.

## Promotion and rollback

Production starts disabled deliberately. To promote, an authorised database operator changes only `enabled` and `rollout_percentage` in `attorney_matter_snapshot_rollout_config`.

Suggested cohorts are 5%, 25%, 50%, then 100%. Roll back immediately by setting `enabled = false` and `rollout_percentage = 0`; the client falls back to the existing workspace loader without a browser deployment.

Do not enable production until the live RPC certification and the query-plan review both pass.
