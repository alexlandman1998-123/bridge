# Attorney Transfer workspace navigation and wiring map

Date: 2026-09-27
Owner: primary `the-it-guy/` application
Scope: the Attorney Transfer tab's proposed stage overview and focused stage workspace. This is the current-state contract for the UI change; it makes no workflow, schema, or remote-data change.

## One source of workflow truth

`AttorneyTransactionDetail.jsx` loads the matter's attorney workflow operations and supplies the active lane, documents, activity, and callbacks to `ArchlineTransferWorkspace`. `buildTransferWorkspaceViewModel` combines the saved lane steps with the applicable matter plan and configured task definitions. It produces `phases`, `tasks`, `selectedTask`, `selectedTaskContext`, permissions, actions, and progress. `buildLegalTaskWorkbenchModel` converts the selected task into the controls shown by `LegalTaskWorkbench`.

The configured Transfer catalogue has six phases in `attorneyWorkflowStages.js`; `buildPhases` includes only phases with tasks in the active matter plan. The pictured matter shows three. The five rows under Instruction & File Opening are **tasks**, not five stages. Neither screen should hard-code the phase count or the tasks shown in the mockups.

| Proposed surface | Current source | Contract to preserve |
| --- | --- | --- |
| Stage-only left list | `viewModel.phases` from `buildPhases` | Use phase key, label, status, completed/total, and applicable tasks. `not_applicable` tasks are excluded from the progress denominator. |
| Selected stage overview | The selected `phase.tasks`, description, and `currentTask` | Show real task status and description. An overview selection must not silently change or complete the saved task. |
| Attention summary | `buildLegalWorkflowOperationalHealthModel` and phase/task readiness data | Today's stage badge groups `operationalHealth.exceptions` by phase, but that list is capped at eight exceptions across the lane. `phase.warningCount` instead sums categories and can count one task more than once. Derive an uncapped, distinct per-stage task count before showing “N items need review” on the overview. |
| Open stage workspace | Phase key and a valid task key from that phase | Prefer the first unresolved task, then the phase's current/last task. A completed or non-applicable phase must still be openable for review. |
| Task navigation in workspace | `phase.tasks` and `selectedTask` | Preserve status, non-applicable/external outcomes, and applicable order. Selection is navigation only. |
| Task heading, guidance, requirements, and document context | `selectedTask` → `selectedTaskContext` → `buildLegalTaskWorkbenchModel` | Use model copy and readiness facts; do not ship illustrative mockup requirements as legal rules. |

## Action wiring that the new workspace must reuse

| User action | Existing path and persistence | Gate / behavior |
| --- | --- | --- |
| Select task | `selectTaskWithUnsavedGuard` in `ArchlineTransferWorkspace` | Warns before discarding dirty confirmations; selection currently persists in session storage. |
| Save confirmation answers and row notes | `TaskConfirmations` → `onSaveConfirmations` → `persistTaskUpdate` → `submitWorkflowStepUpdate` → `updateAttorneyWorkflowStepStatus` | Saves an internal work packet for the selected task. Save errors remain visible. The existing bond/cancellation confirmation can also update a separate routing decision after answers save; its partial-success message must remain. |
| Mark in progress / complete / blocked / waiting / other supported outcomes | `LegalTaskWorkbench` actions → `handleTaskWorkbenchAction` or `markTaskInProgress` → status draft and `persistTaskUpdate` | The projected action and lane permission must allow it. Required note/reason and the task's readiness gate remain enforced by the service. Do not turn a visual stepper into an implicit status update. |
| Request, upload, preview, or review a document | Task action → matter-page callback. Requests use `handleLegalTaskDocumentRequest`; uploads use the contextual upload modal; reviews use `reviewCanonicalDocumentRequirement` and refresh documents/workflow/activity. | Respect separate `canRequestDocuments`, `canUploadDocuments`, and `canReviewDocuments` permissions. Keep the document linked to its canonical requirement. |
| Capture matter, party, finance, source, title, or team details | Task action → existing routing-profile, linked-workspace, or task drawer callback; task-specific save callbacks return to the workflow | Preserve the task context and refresh after a save. These controls vary by task, so a generic Yes/No screen cannot replace them. |
| Schedule signing / add note | Existing task command or appointment drawer callback | Keep the current command and permission path. |
| Publish a client stage update | `TransferJourneyUpdateComposer` → `handlePublishTransferJourneyUpdate` → `addAttorneyTransactionUpdate` | Separate client-visible action; permission is `canPublishClientVisibleUpdate`. Completing an internal task must not publish an update automatically. |

The current rail's collapse button, stage dropdown, “View all tasks”, and task rows are navigation/presentation controls. Screen 1 replaces the first three with stage selection and a complete task list; Screen 2 replaces task rows with its task navigation. Neither replacement should write workflow data.

The task status service checks the current actor's lane permission, validates the selected step and status, enforces visibility and required notes, then commits through the shared journey command with an expected step update timestamp. The page refreshes workflow data after commit. The redesign should call these handlers rather than create a second save path.

## Navigation and compatibility boundaries

- Today the base matter route and `/transactions/:transactionId/transfer/:workflowDetailKey` render the same matter page. The latter already carries legal workflow detail context. The selected task is stored in session storage, not in the URL. A direct link to a stage/task and reliable browser Back need an explicit URL-state design that does not collide with the existing detail route.
- `AttorneyTransactionDetail` guards leaving the Transfer tab; `ArchlineTransferWorkspace` guards switching tasks; `TaskConfirmations` warns on browser unload. Overview ↔ workspace, task stepper, lane switching, and linked drawers must all honor one consistent dirty-answer decision.
- `ArchlineTransferWorkspace` renders `LegalTaskWorkbench` for tasks with an operational contract and retains an older task layout for tasks without one. The new navigation must expose both until a task-by-task audit proves the fallback is unreachable for applicable matters.
- The parent passes live lane permissions. A read-only user may review stage and task details but must not gain answer, status, document, or publication actions through the new layout.
- After a successful save, the write can finish before the background workspace refresh. The new UI must show a saved outcome and then reconcile against refreshed data; a refresh failure should ask for reload rather than imply the save failed.
- The proposed “Next task” control is new navigation. It must not mark the current task complete or skip the unsaved-answer guard.

## Current implementation and release acceptance

The Transfer overview and full-width stage workspace now use the existing view model and task action handlers. The URL selects a stage and task. The focused workspace keeps the confirmation, document, note, and outcome controls and adds a within-stage **Next task** button. Next task only navigates; it never saves or completes work. Unsaved confirmations block completion and Next task until saved; other task navigation asks before discarding them.

Focused checks cover the URL fallback, stage selection, read-only overview, answer save and remount, document request/upload/review callbacks, completion action, and Next task. Reuse `scripts/attorney-transfer-navigation.test.mjs`, `scripts/legal-task-inline-work.test.mjs`, `scripts/legal-task-workbench-simplification.test.mjs`, `scripts/legal-task-workbench-phase4-operational.test.mjs`, `scripts/attorney-workbench-permission-contract.test.mjs`, and `scripts/attorney-workflow-refresh-phase4.test.mjs`.

Phase 5 hardening covers new, partly complete, blocked, completed, and not-applicable stage presentation. A stage with no applicable tasks says so instead of showing a `0 of 0` progress range, and it remains openable for review. The focused workbench hides completion controls for read-only users even if an upstream model supplies an action. The navigation check exercises these states and the related permission, task-save, and workflow-refresh checks pass locally.

Release acceptance still needs a signed-in browser walkthrough against an appropriate editable test matter: save an Instruction Received answer, reload, confirm the saved answer and progress from persisted data, exercise Back/Forward and a cancelled unsaved-answer warning, and verify an assigned read-only user. The local browser reached sign-in but had no authenticated session, so source and rendering checks do not prove live persistence or browser acceptance. The independent cancellation-lane Phase 9 release check is currently blocked by missing action mappings for `cancellation_guarantee_allocation_review`, `cancellation_consent_confirmed`, and `cancellation_simultaneous_lodgement_confirmed`; it must pass before a shared Attorney release. No deployment or remote-data write was performed for this navigation change.
