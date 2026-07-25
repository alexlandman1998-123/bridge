# Supabase Phase 6 Attorney Workflow Runtime Plan

Generated: 2026-07-25

## Scope

Phase 6 isolates the attorney workflow runtime migration. This phase does not apply SQL, repair the migration ledger, or retire the Phase 0 broad-push freeze.

The target stream is:

- `attorney_workflow_runtime`

## Implemented

- Verified that the Phase 5 application manifest groups the attorney workflow row under `attorney_workflow_runtime`.
- Verified that staging and production runners produce the same one-row execution plan.
- Confirmed that the expected catalog objects are already live, so this stream is repair-only after smoke evidence.

## Attorney Workflow Runtime Plan

| Version | Depends On | Action | Evidence | File |
| --- | --- | --- | --- | --- |
| `202607230013` | `stream preflight` | `repair_only_after_smoke` | `all_live` 2/2 | `202607230013_attorney_workflow_step_completion_advance.sql` |

## Runtime Shape

The migration defines the atomic attorney workflow step updater:

- updates a transaction subprocess step status
- advances the lane `current_stage`
- recalculates lane status
- writes attorney lane history
- emits a transaction event
- restricts execution to authenticated attorney workspace users assigned to the transaction or active firm members

Because the objects are already live, the correct next step is not SQL replay. It is smoke testing followed by a narrow ledger record for `202607230013`.

## Required Smoke Evidence

Before any staging or production ledger repair, evidence should prove:

- an assigned attorney can complete a workflow step
- completing a step advances `transaction_subprocesses.current_stage` to the next incomplete step
- completing the final step marks the lane completed
- blocked and waiting statuses keep focus on the current step
- a row is written to `transaction_attorney_lane_history`
- a matching `transaction_events` row is emitted with the expected visibility
- an unassigned or non-attorney user is rejected

## Current Blockers

Live mutation remains blocked by the repository gates:

- No reviewed staging smoke evidence exists for `202607230013`.
- Production execution requires reviewed staging evidence before ledger repair.
- Phase 8 closeout is still blocked because all 20 manifest rows lack complete production evidence.

## Read-Only Verification Commands

```bash
node scripts/supabase-phase6-staging-execution.mjs --plan --stream attorney_workflow_runtime --json
node scripts/supabase-phase7-production-execution.mjs --plan --stream attorney_workflow_runtime --json
```

