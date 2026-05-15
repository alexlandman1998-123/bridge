# Attorney Transaction Workflow Phase 4 Notes

## Scope Completed

Phase 4 turns the Phase 3 resolver output into usable attorney workflow lanes in the transaction workspace.

Implemented:

- conditional lane initialization for required attorney workflows
- transfer, bond, and cancellation lane support
- stage progression and regression validation
- stage history persistence
- internal/shared/client-safe lane updates
- lane-specific document requests
- activity logging with visibility scope
- transaction workspace Attorney Operations panel

## Data Model

Added migration:

- `supabase/migrations/202605150003_attorney_workflow_lanes.sql`

It extends existing `transaction_subprocesses` and `transaction_subprocess_steps` instead of creating a parallel workflow engine.

New/extended persistence:

- `transaction_subprocesses.attorney_role`
- `transaction_subprocesses.attorney_assignment_id`
- `transaction_subprocesses.current_stage`
- `transaction_subprocesses.lane_status`
- `transaction_subprocesses.due_date`
- `transaction_subprocesses.completed_at`
- `transaction_subprocesses.updated_by`
- `transaction_attorney_lane_history`
- `transaction_attorney_lane_updates`
- lane metadata columns on `document_requests` and `documents`

## Service Layer

Added:

- `src/services/attorneyWorkflow/attorneyWorkflowLaneService.js`

Key functions:

- `getAttorneyWorkflowOperationsForTransaction`
- `updateAttorneyWorkflowLaneStage`
- `addAttorneyWorkflowLaneUpdate`
- `requestAttorneyWorkflowLaneDocument`

Lane creation is idempotent and only creates required lanes from the Phase 3 resolver.

## UI Integration

Added:

- `src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx`

Integrated into:

- `src/pages/AttorneyTransactionDetail.jsx`

The panel shows required attorney lanes, assigned firm/user, current stage, lane status, progress, outstanding lane documents, recent updates, and quick actions.

Quick actions include:

- Update Stage
- Add Update
- Request Document
- Open Signing Packets

## Permission Behavior

Stage updates, lane updates, and lane document requests call the Phase 2 permission helpers.

Default behavior:

- attorneys can update only lanes where assignment permissions allow it
- agents/developers see legal progress but do not get lane edit actions
- internal attorney updates default to `internal`
- client-visible updates are explicit, never default

## QA Fixtures

Added:

- `scripts/verify-attorney-workflow-lanes.mjs`

The fixture checks:

- cash creates/requires transfer only
- bond requires transfer + bond
- hybrid cancellation requires transfer + bond + cancellation
- final stage keys remain stable

Verification result:

- `node scripts/verify-attorney-workflow-lanes.mjs` passed.

## Build / Lint

Build:

- `npm run build` passed.
- Existing Vite warnings remain: one CSS minify syntax warning from generated CSS and large bundle chunk warnings.

Targeted lint:

- `npx eslint src/services/attorneyWorkflow/attorneyWorkflowLaneService.js src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx src/core/transactions/roleConfig.js src/pages/AttorneyTransactionDetail.jsx scripts/verify-attorney-workflow-lanes.mjs` passed with no errors.
- Existing `AttorneyTransactionDetail.jsx` hook warnings remain.

Full lint:

- `npm run lint` still fails on existing repo-wide lint debt: 95 errors and 31 warnings.
- The failures are spread across pre-existing files such as `src/lib/api.js`, `src/pages/ClientPortal.jsx`, `src/pages/DevelopmentDetail.jsx`, `src/components/SubprocessWorkflowPanel.jsx`, and temporary spec files.

## Known Boundaries

This phase does not add dashboard analytics, advanced readiness scoring, automated external messaging, or polished final visual redesign.
