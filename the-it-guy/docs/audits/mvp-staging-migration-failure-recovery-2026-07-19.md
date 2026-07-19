# Staging reconciliation migration failure and recovery note — 19 July 2026

## On any migration or smoke-check failure

1. Keep pilot exposure paused and stop immediately.
2. Preserve the raw database error: command output, SQLSTATE, message, migration version, Git commit and UTC time.
3. Capture read-only ledger, schema and RPC evidence after the failure.
4. Determine whether the migration transaction rolled back or the migration committed before a later contract check failed.
5. Recover only through a reviewed forward migration.

## Never do these things

- Do not use migration repair or manipulate the Supabase migration ledger.
- Do not manually update, insert, delete or backfill production-like transaction data to force a passing check.
- Do not reset, truncate, restore over or recreate staging during triage.
- Do not edit historical migration SQL.
- Do not resume the pilot until recovery is verified and explicitly approved.

## Recovery paths

If preflight or transactional DDL fails, verify the rollback read-only and prepare a corrected forward migration or preflight. If the migration commits but the RPC/smoke check fails, leave its additive schema in place and issue a new append-only correction migration. Never manually undo the applied migration.

The incident record must contain the error, migration/Git identity, ledger before/after, schema/RPC probes, and the explicit decision to remain paused or resume.
