# Attorney MVP phase 1 — task-state foundation

## Implemented locally

- Shared applicable-task selection for header, Work, lane summaries and dashboard cards. Active plans take precedence, including excluded lanes.
- Header phases use Work phase definitions rather than independent keyword matching.
- Removed stage-position and document-derived task completion. Evidence readiness remains separate from saved task status.
- Planned missing records remain incomplete in UI counts and atomic plan calculations.
- Dashboard retrieves persisted steps and the plan for snapshot and compatibility paths, rather than estimating completion from stage position.
- Dashboard refresh listens for committed transaction changes, reloads on entry and rejects older overlapping responses. React review informed listener cleanup and request sequencing.
- Data and document actions are selected by requirement type. Capture profile opens with existing values; other requirements route to party, finance or matter details. Notes use the selected lane.
- Added versioned step-update RPC. It serialises edits per transaction, checks lane mutation permission, updates task/lane/lifecycle/history/event together, and removes client-side post-commit reconciliation.
- Lifecycle derives from outstanding applicable tasks rather than preserving the highest stage ever reached on an active matter.

## Verification

Passed:

- attorney-mvp-task-state.test.mjs: transfer/bond/cancellation, active-plan authority, missing tasks, counts, completion/reopening, actual header projection versus Work, dashboard projection versus Work, data/document action classification.
- legalWorkflowProgress.test.js.
- attorney-workflow-scenario-alignment.test.mjs.
- matter-workflow-plan.test.mjs.
- legal-task-workbench-phase3-multilane.test.mjs.
- legal-task-workbench-phase4-operational.test.mjs.
- Isolated PostgreSQL/PGlite test of the new migration: completion, reopening, missing planned rows, full rollback after event failure and denied mutation.
- Production Vite build passed before the final dashboard wiring; both final page files compile and final targeted tests pass.
- git diff --check.

Three older tests fail on unchanged layout/text expectations: legal-workspace-consolidation-ux-phase4, legal-workspace-ux-phase5-acceptance, legal-task-workbench-phase2. These are not a green full-suite result.

The SQL test supplies minimal schema fixtures and stubs stage-mapping/permission dependencies. It tests transaction behaviour, not the deployed database's schema, permissions or complete migration history.

## Deployment and remaining acceptance

Migration: supabase/migrations/20260908071547_attorney_mvp_atomic_task_progress.sql.

Apply and verify the migration before releasing the frontend that calls bridge_update_attorney_workflow_step_v2. Missing RPC fails closed; the client does not silently fall back to the old split update.

Nothing was pushed, deployed or applied to production. The configured local database refused connection; isolated PostgreSQL was used instead.

Live authenticated browser validation is still required: each task action and its actual form/save, Supabase nested dashboard reads/RLS, completion/reopening after refresh and independent role sessions. Existing non-profile detail destinations have not been certified to expose every field needed by every checklist requirement.

MVP phase 2's applicability controls, completed-externally/not-applicable semantics and legal-template review are not part of this change. No historical task statuses were rewritten.

The unrelated DevelopmentDetail.jsx edit was preserved.
