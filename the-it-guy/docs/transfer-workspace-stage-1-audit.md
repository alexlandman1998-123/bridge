# Transfer Workspace Stage 1 Architecture Audit

Date: 2026-07-23

## Scope

This audit covers the proposed Transfer Attorney workspace refactor before UI implementation. The goal is to preserve the existing workflow logic and build the new workbench as a presentation/state layer over the current matter, lane, step, document, note, activity, and permission model.

## Current Architecture Summary

The matter workspace route is rendered by `AttorneyTransactionDetail` for both the base transaction URL and the workflow-detail URL:

- `src/App.jsx:1975` routes `/transactions/:transactionId` to `AttorneyTransactionDetail`.
- `src/App.jsx:1985` routes `/transactions/:transactionId/transfer/:workflowDetailKey` to the same component under a different error-boundary scope.

The Transfer tab content is currently rendered in `AttorneyTransactionDetail` by `ArchlineWorkflowWorkspace`:

- `src/pages/AttorneyTransactionDetail.jsx:5699` defines `ArchlineWorkflowWorkspace`.
- `src/pages/AttorneyTransactionDetail.jsx:13836` chooses the Transfer/Cancellation workflow workspace.
- `src/pages/AttorneyTransactionDetail.jsx:13859` renders the Transfer workflow instance.

The current Transfer workspace already has a three-column shape, but it duplicates progress and still behaves like a tracker:

- Left column: full vertical workflow list plus separate progress/summary cards.
- Center column: current stage header plus a duplicated task table capped to the first eight rows.
- Right column: workflow-level documents, blockers, key dates, and related context.

The existing business logic should remain in place. The refactor should replace the Transfer presentation layer, not create a parallel workflow engine.

## Relevant Files And Components

Primary page:

- `src/pages/AttorneyTransactionDetail.jsx`
  - `WORKFLOW_STATUS_META` at line 1221.
  - `buildLegalWorkflowProgressSteps` at line 3587.
  - `LEGAL_WORKFLOW_PROGRESS_PHASES` at line 3645.
  - `buildLegalWorkflowProgressPhases` at line 3683.
  - `LegalWorkflowRequirementsPanel` at line 4077.
  - `ArchlineWorkflowWorkspace` at line 5699.
  - `submitWorkflowStepUpdate` at line 10879.
  - `legalWorkflowModels` at line 11736.
  - `archlineDocumentsByWorkflow` at line 12043.
  - `handleArchlineLegalWorkflowStepUpdate` at line 12134.

Workflow constants:

- `src/constants/attorneyWorkflowStages.js`
  - `ATTORNEY_WORKFLOW_STAGE_DEFINITIONS` at line 220.
  - Transfer stage definitions begin at line 223.
  - Existing transfer step metadata includes labels, descriptions, aliases, readiness gates, required data, required documents, evidence requirements, visibility, and client-visible rules.
  - `getAttorneyStageDefinition` at line 1210.
  - `getAttorneyStageDefinitionsForLane` at line 1231.

Workflow service:

- `src/services/attorneyWorkflow/attorneyWorkflowLaneService.js`
  - `normalizeStepStatus` at line 93.
  - `mapStep` at line 284.
  - `mapLaneRow` at line 373.
  - Fetches transaction subprocess lanes from `transaction_subprocesses` at line 479.
  - Builds lane requirements, permissions, timelines, readiness checklists, and attention summaries at line 910.
  - `updateAttorneyWorkflowStepStatus` at line 1347.

## Existing Data Model

Current relationship:

```text
Transaction / Matter
  -> Attorney workflow operations
    -> Lanes: transfer, bond, cancellation
      -> Steps from transaction_subprocess_steps plus configured stage definitions
        -> Step status, comment, owner role/type, sort order, visibility, completed/updated timestamps
      -> Lane-level data requirements
      -> Lane-level document requirements and document requests
      -> Lane timeline / updates
      -> Permissions
      -> Readiness, evidence, follow-up, and attention summaries
```

The lane object currently exposes enough structure for a staged UI adapter:

- `lane.steps`
- `lane.summary`
- `lane.dueDate`
- `lane.assignment`
- `lane.permissions`
- `lane.timeline`
- `lane.documentRequests`
- `lane.documentRequirements`
- `lane.documentSummary`
- `lane.dataRequirements`
- `lane.dataSummary`
- `lane.readinessChecklist`
- `lane.evidenceChecklist`
- `lane.attentionSummary`
- `lane.nextActions`
- `lane.followUps`

Current step rows expose:

- `id`
- `subprocessId`
- `stepKey`
- `stepLabel`
- `ownerRole`
- `ownerLabel`
- `statusBucket`
- `readinessGate`
- `evidenceRequirements`
- `requiredDocumentKeys`
- `status`
- `completedAt`
- `comment`
- `ownerType`
- `sortOrder`
- `visibilityScope`
- `sharedProgress`
- `updatedAt`

Notably absent at the step level:

- editable assignee
- editable due date
- independently persisted checklist item completion
- direct activity relationship keyed to a specific task, beyond lane/timeline/update metadata

## Workflow Grouping

Workflow grouping can be derived without a migration for the first implementation.

There are two existing grouping sources:

- Configured stage definitions in `ATTORNEY_WORKFLOW_STAGE_DEFINITIONS`.
- Frontend phase mapping in `LEGAL_WORKFLOW_PROGRESS_PHASES`.

The current phase mapping already groups transfer steps into:

- Open File
- Parties & FICA
- Duty & Clearances
- Docs, Signing & Guarantees
- Lodgement & Registration
- Close-Out

The mock labels are slightly different, but the concept matches. The new workbench should use a frontend adapter that groups canonical steps by stable `step.key` / `stepKey`, not by display labels.

No database migration is required for grouped navigation unless the product needs admin-configurable phase membership.

## Status Support

There are two status layers:

### UI display statuses

`WORKFLOW_STATUS_META` supports:

- `not_started`
- `in_progress`
- `waiting`
- `blocked`
- `delayed`
- `completed`

### Persisted step statuses

`normalizeStepStatus` only allows:

- `not_started`
- `in_progress`
- `waiting`
- `blocked`
- `completed`

`pending` normalizes to `waiting`; `complete` normalizes to `completed`.

### Status decision

| Proposed UI label | Safe canonical value | Persistence support | Notes |
| --- | --- | --- | --- |
| Not Started | `not_started` | Yes | Supported. |
| In Progress | `in_progress` | Yes | Supported. |
| Completed | `completed` | Yes | Supported. |
| Blocked | `blocked` | Yes | Supported. |
| Delayed | `delayed` | Display only currently | UI meta exists, but workflow step persistence does not allow it. |
| Not Applicable | none yet | No | Do not add as an active workflow-step action without backend/model support. |

The first refactor should not introduce duplicate statuses. `Delayed` can be represented as `waiting` or `blocked` with a note until persistence is expanded, or it should be hidden/disabled. `Not Applicable` should be excluded from Stage 2 unless the workflow status contract is extended.

## Current Task Action Behaviour

Current task interaction in `ArchlineWorkflowWorkspace`:

- Clicking a step opens a local `statusDraft`.
- The draft supports changing the step status and adding a note.
- Submit calls `onUpdateStep`.
- The Transfer instance wires `onUpdateStep` to `handleArchlineLegalWorkflowStepUpdate`.
- `handleArchlineLegalWorkflowStepUpdate` builds the lane/step draft and calls `submitWorkflowStepUpdate`.
- `submitWorkflowStepUpdate` calls `updateAttorneyWorkflowStepStatus`, then refreshes operations via `refreshWorkflowAfterChange`.

The service mutation:

- Authorizes the user with `assertCanUpdateLane`.
- Looks up the lane and step.
- Applies visibility rules.
- Calls the `bridge_update_attorney_workflow_step` RPC.
- Publishes shared progress.
- Returns refreshed attorney workflow operations.

This means the new UI should reuse the existing mutation path instead of creating a separate task update endpoint.

## Notes, Documents, Activity, And Permissions

Notes:

- Notes currently flow through `addAttorneyTransactionUpdate`.
- Internal notes cannot be client-visible.
- Visibility is enforced before save.
- The current workflow UI shows lane/activity entries but does not expose a separate persisted per-task notes model.

Documents:

- Lane document requirements are real and come from the legal requirements resolver.
- `archlineDocumentsByWorkflow` currently picks workflow-level document rows by text tokens across display name, category, related workflow, required document key, and required party.
- Step definitions include `requiredDocumentKeys`, so task-relevant documents can be derived, but there is not yet a proven direct persisted task-document link.

Activity:

- Lane timelines and transaction events exist.
- Status updates publish shared progress and return refreshed workflow operations.
- Task-specific activity can likely be filtered by lane/step metadata where available, but should not be presented as fully task-scoped unless the event payload confirms the step key.

Permissions:

- Lane permissions are already exposed on each lane:
  - `canUpdateStage`
  - `canAddInternalNote`
  - `canAddSharedUpdate`
  - `canPublishClientVisibleUpdate`
  - `canRequestDocuments`
  - `canUploadDocuments`
  - `canReviewDocuments`
  - `canManageSigning`
  - `canAssignAttorney`

The new UI should gate buttons from these lane permissions.

## Missing Or Partial Capabilities

Safe now:

- Grouped workflow navigator.
- First actionable task selection.
- Center selected-task workspace.
- Overview tab from step description, evidence requirements, readiness gate, required data, and required documents.
- Workflow-level progress and attention summary.
- Lane-level notes and activity.
- Lane-level required documents and document status.
- Status updates for `not_started`, `in_progress`, `waiting`, `blocked`, and `completed`.
- Permissions-aware action rendering.

Partial / derive carefully:

- Task-specific documents, using `step.requiredDocumentKeys` plus lane `documentRequirements`.
- Task-specific activity, using lane timeline/event metadata where the step key is present.
- Missing document counts, using lane `documentSummary` and selected-step document requirements.
- Search and filters for status/phase/required document keys.

Needs backend/model support before full mock fidelity:

- Persisted `delayed` step status.
- Persisted `not_applicable` / waived step status.
- Editable per-task assignee.
- Editable per-task due date.
- Editable per-task checklist items.
- Add custom task, unless an existing task model supports it.
- Guaranteed task-document foreign-key linkage.
- Guaranteed task-level audit trail if event payloads do not include step keys.

## Proposed Stage 2 Implementation Approach

Create a frontend adapter before replacing the UI:

```js
buildTransferWorkspaceViewModel({
  workflow,
  workflowKey,
  documents,
  keyDates,
  parties,
  activityFeed,
})
```

Target output:

```js
{
  phases,
  tasks,
  selectedTask,
  progress,
  attention,
  relatedDocuments,
  keyDates,
  parties,
  permissions,
  availableActions,
}
```

The adapter should:

- Use `buildLegalWorkflowProgressSteps` as the canonical task source.
- Use `buildLegalWorkflowProgressPhases` for grouping.
- Preserve all existing step keys and ordering.
- Select the first blocked/waiting/in-progress task, then first incomplete task.
- Resolve selected task by stable key.
- Derive task documents from `requiredDocumentKeys`.
- Gate actions from lane permissions and persisted status support.
- Keep URL/query-param state separate from route changes to avoid remounts.

Then replace only the Transfer rendering inside `ArchlineWorkflowWorkspace` or split it into a dedicated transfer component that still receives the same workflow props and mutation handlers.

## Migration Required?

No migration is required for the first premium workbench implementation if the scope is:

- grouped navigation
- selected task workspace
- workflow toolbar
- context rail
- real status updates using currently supported statuses
- derived task documents/checklist/readiness data
- lane-level notes/activity

Migration or API work is required only for:

- `delayed` as a persisted step status
- `not_applicable` as a persisted step status
- per-task assignee
- per-task due date
- editable checklist item persistence
- hard task-document linking
- guaranteed task-level audit logs

## Risks

- The existing `/transactions/:transactionId/transfer/:workflowDetailKey` route remounts the same page under a different error-boundary scope. Query params/local state should be preferred for task selection.
- The current UI shows `Delayed`, but persisted workflow steps do not currently accept `delayed`.
- The mock's `Not Applicable` action is not currently backed by workflow-step status support.
- Task-specific documents could look precise while actually being derived by requirement keys; label this carefully in code and UI.
- Replacing the duplicated table must preserve the existing mutation path, visibility rules, permissions, and refresh behaviour.
- Independent scroll columns need responsive testing so mobile and laptop layouts do not trap content.

## Stage 1 Decision

The suggested implementation plan is feasible if Stage 2 starts with a view-model adapter and avoids unsupported persisted features. The first build should hide or disable `Delayed`, `Not Applicable`, editable assignee, editable due date, and editable checklist controls until backend/model support is confirmed.
