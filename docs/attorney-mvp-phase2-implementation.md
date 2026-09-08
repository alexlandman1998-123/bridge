# Attorney MVP Phase 2 — discretionary checklist

## Scope

An operational checklist, not legal-compliance certification. This pass builds on the local Phase 1 single-task-state changes.

- New or explicitly regenerated plans retain the standard transfer checklist, including municipal rates and levy clearance, payment security and compliance-certificate review. Cash/freehold does not silently remove tasks.
- An incomplete profile produces a provisional transfer plan so an attorney can start work. Unknown finance and tax facts remain unknown.
- Profile controls include buyer/seller marital regime, payment security, HOA applicability, and optional bond/cancellation lanes (automatic, include or exclude). Excluding a lane requires a recorded reason.
- Profile-based suggestions inform the attorney; they do not automatically mark a task complete or not applicable.
- Outcomes are Complete task, Completed externally, Not applicable and Reopen. External completion and not-applicable outcomes require reasons, stored with the task and audit events. The reason is visible when revisiting the task.
- Ordinary/external completion count as done. Not-applicable tasks are excluded from the denominator. All-not-applicable checklists have zero applicable tasks and display 0%, not fabricated 100% completion.
- Missing evidence remains outstanding. External completion does not confirm evidence checks. Operational completion does not automatically send a client communication.
- Older move-stage actions now update one task instead of auto-completing preceding tasks. Work ahead does not overwrite earlier outcomes.
- Existing active plans are preserved on read. Explicit profile save is needed to regenerate older plans; no bulk production rewrite is included.

## Persistence and rollout

Apply the local Phase 1 migration first:

1. `20260908071547_attorney_mvp_atomic_task_progress.sql`
2. `20260908073924_attorney_mvp_task_discretion.sql`

Then deploy the matching frontend. Phase 2 calls `bridge_update_attorney_workflow_step_v3`; deploying only the UI will not enable the new outcomes.

The Phase 2 migration extends task statuses and replaces lifecycle/profile reconciliation to recognise external and not-applicable outcomes. Task mutation, lane recomputation, canonical lifecycle and audit insertion occur in one database call. Matter-before-lane locking is shared by task updates and profile reconciliation. Lane-scoped permissions remain enforced.

No production migration, history repair, commit, push or deployment was performed in this pass. Existing database constraints/data and the full migration chain still need a staging check. The isolated SQL fixture exercises the migration bodies but stubs the existing permission helper and stage mapping; it does not certify live RLS or legal correctness.

## Verification

Targeted checks cover:

- Provisional profiles, optional lanes, retained transfer tasks, preserved accepted plans.
- Ordinary/external/not-applicable outcomes and reopening across transfer, bond and cancellation projections.
- Work/header/dashboard progress agreement and workflow-health denominator agreement.
- External completion not asserting evidence, missing-document warnings surviving completion.
- Visible outcome actions and required reasons.
- Isolated PostgreSQL execution of both new migrations; reason validation, missing planned rows, profile reconciliation, transaction rollback on event failure, and permission denial.

Test commands (from repository root):

```sh
node the-it-guy/scripts/attorney-mvp-discretion.test.mjs
node the-it-guy/scripts/attorney-mvp-task-state.test.mjs
node the-it-guy/scripts/matter-workflow-plan.test.mjs
node the-it-guy/scripts/transaction-routing-profile.test.mjs
node the-it-guy/scripts/legal-task-workbench-phase3-multilane.test.mjs
node the-it-guy/scripts/legal-task-workbench-phase4-operational.test.mjs
node the-it-guy/scripts/legal-workflow-operational-health-phase6.test.mjs
PGLITE_MODULE=/path/to/pglite/dist/index.js node the-it-guy/scripts/attorney-mvp-task-discretion-sql.test.mjs
```

PGlite was supplied outside the repository; no dependency or lockfile changes are needed. Production build: `npm run build` inside `the-it-guy/`.

## Next acceptance gate

On staging, verify one cash transfer and one financed transfer with linked cancellation, then repeat with company and married-individual profiles. Exercise each outcome, reload, open the same matter under separately signed-in attorney/agent/developer accounts, and verify authorised shared progress without unintended client publication. Verify excluded lanes remain in history but are absent from the active checklist. This pass does not replace professional review of the checklist or establish legal readiness to lodge.
