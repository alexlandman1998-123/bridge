# Attorney Transfer workspace navigation and wiring map

Date: 2026-09-27
Owner: primary `the-it-guy/` application
Scope: the Attorney Transfer tab's proposed stage overview and focused stage workspace. This is the current-state contract for the UI change; it makes no workflow, schema, or remote-data change.


## All lane side panel audit

The [6 October task workspace audit](attorney-task-workspace-audit.md) covers all 89 current catalogue tasks across transfer, bond and cancellation, plus historical definitions, aliases and unrecognised saved tasks. It is the Phase 1 baseline for the selected side-panel design across every stage. Reuse the wiring below when placing the selected task beside its stage list; carry forward the audit's compatibility and comment-scope findings.

Phase 2 now supplies the shared layout and a read-only compatibility panel for saved tasks without a supported operational contract. The Phase 1 audit records the earlier baseline; its two failing checks have been reconciled with current headings and task definitions during implementation.

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

On 6 October 2026, Phase 2 places the existing task workbench beside its stage list across transfer, bond and cancellation. The configured stages and their saved progress remain above the working area. Desktop keeps the list beside the selected task; smaller screens show the selected task with a **Back to stage** control. Closing restores focus to the originating row and its viewport position. Embedded work omits the workbench's duplicate stage/task navigators and repeated stage header.

Existing URL stage, task and lane selection still powers direct links and browser navigation. Selecting stages or tasks does not save an outcome. Unsaved confirmation answers and their notes, inline matter/source/title fields, team allocation and outcome notes feed the existing parent navigation guard. Cancelled navigation and failed saves retain drafts; background refreshes do not overwrite edited inline fields. Saves and document actions still call the established page callbacks and permission paths.

Saved identifiers and outcomes are preserved exactly. Older aliases and unrecognised saved tasks receive a compact read-only history/document panel; they do not inherit a newer combined review's completion rules. Tasks whose saved stage is unavailable appear under **Other saved tasks**. Unsupported tasks cannot enter a bulk or stage override. Completed externally remains explicit, and the selected panel explains a recorded completion with outstanding checklist evidence. Waiting and blocked actions remain under task options.

Phase 2 reuses existing task content. The Phase 1 findings about task-specific editors and lane-wide comment projection remain work for later phases; this change does not add legal requirements, a storage model or a second persistence path.

Focused checks cover the URL fallback, stage selection, read-only overview, answer save and remount, document request/upload/review callbacks, completion action, and Next task. Reuse `scripts/attorney-transfer-navigation.test.mjs`, `scripts/legal-task-inline-work.test.mjs`, `scripts/legal-task-workbench-simplification.test.mjs`, `scripts/legal-task-workbench-phase4-operational.test.mjs`, `scripts/attorney-workbench-permission-contract.test.mjs`, and `scripts/attorney-workflow-refresh-phase4.test.mjs`.

Phase 5 hardening covers new, partly complete, blocked, completed, and not-applicable stage presentation. A stage with no applicable tasks says so instead of showing a `0 of 0` progress range, and it remains openable for review. The focused workbench hides completion controls for read-only users even if an upstream model supplies an action. The navigation check exercises these states and the related permission, task-save, and workflow-refresh checks pass locally.

Phase 2 local checks render all 89 catalogue tasks and preserve 71 declared aliases. Interaction checks cover all three lanes, focus/scroll restoration, cancelled draft navigation, save failures and refreshes during editing. Chrome checks use the actual shared components with local fixture data at desktop, 390-pixel and 320-pixel widths; they verify keyboard opening, close, browser Back/Forward, a cancelled draft warning and historical review. Screenshots are saved under root `output/playwright/attorney-task-panel-*-20261006.png`.

The navigation, inline work, simplification, operational contract, workbench operational, permission, workflow refresh and view-model checks pass locally. The root `npm run check:app` also passes lint, the app service tests, production build and login probe. Existing lint warnings remain; the changed files have no lint errors. Temporary preview files and the preview server were removed after verification.

Release acceptance still needs a signed-in walkthrough against an appropriate editable test matter: save an answer, reload, confirm persisted progress and verify an assigned read-only user. The component preview and local permission checks do not establish live Tuckers access or deployed database behaviour. The audit's cancellation action-mapping gaps must be resolved before a shared Attorney release. No deployment or remote-data write was performed.


## Phase 3 task records and save recovery

On 6 October 2026, the shared workbench keeps task comments inside the side panel across transfer, bond and cancellation. Comments use an explicit lane/task identity, default to internal visibility, acknowledge the atomic receipt before refreshing history, and retain an identical command ID when a failed or uncertain request is retried. Refreshed copies replace the locally acknowledged note without duplicating it. General lane notes remain in matter history; task activity no longer infers identity from titles or message text. The timeline adapter preserves the saved identity and metadata for these reads.

Comments, confirmation answers, inline fields, outcome notes and document correction notes participate in draft recovery. Switching sections or resizing retains their text; closing or changing a document with a correction draft asks before discarding it. Unrelated workflow-note refreshes cannot close an open review. Saving an inline field does not reset its acknowledged value to the older model while refresh is pending. Confirmation/comment/document save activity reaches the workspace navigation guard, including browser navigation; completion stays on the selected task and leaves the next task to an explicit action. Manual completion records show their method/reason separately from outstanding checklist evidence.

The new append-only migration `supabase/migrations/20261006160000_attorney_task_comment_scope.sql` adds `bridge_add_attorney_task_comment_and_sync_v1`. It uses the existing internal-comment sync command, actor/lane permissions, private lane audience and atomic receipt tables. It validates a saved task in the selected matter/lane, rechecks permission on replay, rejects reuse for a different comment, and rolls back the comment if synchronisation fails. The existing lane-wide comment entry point remains available for unscoped notes. The migration has been tested in isolated PostgreSQL and has **not** been applied remotely. New task-comment saves require this migration at release; missing support surfaces a save error and retains the draft.

Phase 3 local checks cover all three lanes: component draft/refresh recovery, duplicate-click suppression, stable comment retries, strict activity scope, private audiences, revoked permissions, sync rollback, atomic answer/outcome persistence and existing refresh propagation. The navigation, simplification, operational, permission and view-model checks pass, as does `npm run check:app` (existing lint warnings remain). Chrome uses local fixture callbacks and actual shared components; desktop/mobile checks verify resize, failed-save recovery and retry with no console errors. Screenshots are under `output/playwright/attorney-task-comments-*-phase3-20261006.png`. These checks do not establish a live Tuckers save or deployment. Signed-in release acceptance still requires applying the migration, saving/reloading each lane's comments and confirming task/document permissions on an appropriate test matter.


## Phase 4 task-specific work

The primary transaction app now attaches task-specific controls to 45 existing confirmation rows across transfer, bond and cancellation. All 89 catalogue tasks retain their identifiers, outcomes and saved-plan applicability. Existing intake, title, matter team, party/FICA/capacity, tax, property, security, appointment and specialist editors remain in use; the new controls fill the record gaps rather than introducing a second workspace.

- Prepared transfer, bond and cancellation packs record preparation date, author, pack/version and included or outstanding documents. Signing reviews record the signed pack and review details; scheduling retains the existing appointment flow.
- Bank conditions record the condition/query, owner, due date, position and response reference. Outstanding and resolution reviews start from the earlier saved condition register when there is no current saved record, require a fresh answer, and never rewrite the earlier record.
- Bank submissions record initial submissions and resubmissions separately, with channel, recipient, pack/version, date, portal/reference and query/correction response. The authority-to-lodge record separately identifies the bank/official, approved pack, authority date/reference, conditions and stated validity. A submission acknowledgement does not establish authority. The current bank lodgement instruction remains a separate review.
- Cancellation notice, figures requests/receipt/validity, penalty risk/escalation, guarantee requests/receipt/acceptance and consent have specific records. Existing account-allocation and settlement registers remain available. Transfer, bond and cancellation lodgement, registration and close-out records capture their respective dates, references and outstanding follow-up.

Single records display their fields directly. Repeated bank-condition and submission registers have named add/remove actions. All fields save through the existing confirmation `items` payload and canonical atomic workflow command; no Phase 4 database migration or new persistence endpoint is introduced. Unknown older fields and entries are preserved. Dates, non-negative amounts and declared choices are checked before save; partial records remain saveable with an explicit answer, and existing legal completion checks remain authoritative.

The confirmed task record can supply otherwise uncaptured lane information for the bank/reference, approved amount, cancellation bank/account, notice position, figures expiry, penalty basis and settlement reference. Existing captured matter facts retain priority; these records do not replace routing, party or lender decisions. Their data requirement actions focus the matching panel fields, instead of navigating to a general finance page. Saves record events and evidence; they do not send requests, notices, bank submissions or a proceed instruction, and do not implicitly complete a task.

Phase 4 local verification: `scripts/legal-task-workbench-phase4-operational.test.mjs` covers all 89 tasks, the 45 record mappings, captured-value reload/priority, validation and carried conditions. `scripts/legal-task-inline-work.test.mjs` covers three-lane record editing, failure/retry, refresh recovery, remount, read-only controls and resubmissions. The real PostgreSQL atomic fixture verifies structured records through the command, authenticated read, privacy and rollback paths in all three lanes. Navigation, simplification, task contract, permission, refresh and view-model checks pass; root `npm run check:app` passes with existing warnings. Chrome preview checks use actual shared components and local callbacks at 1440, 390 and 320 pixels, including failed-save recovery, reload, read-only controls and keyboard focus into the correct bank detail fields. A narrow phone heading caught during visual inspection was corrected by placing task actions below the title; 390/320-pixel checks verify a readable heading and no page overflow. Screenshots are under `output/playwright/attorney-task-content-*-20261006.png`.

This is a local implementation, not a deployed Tuckers change. Phase 3's task-comment migration still requires release application. Signed-in release acceptance should save/reload these records on a test matter in each lane and verify its actual documents, lender instructions, permissions and hard completion checks.


## Phase 5 hardening and final verification

The shared stage overview and task panel now retain a stage/bulk completion reason after a failed save. The confirmation stays open with an explicit failure message and a count of acknowledged saves. A retry keeps the same audit group and original task scope, skips tasks acknowledged as saved, and updates only the remaining tasks. Current lane access and hard legal completion checks are rechecked before each write; a permission change stops the rest of a batch and preserves the note for review. Permission is kept separate from temporary save/draft locks in the transaction page.

A stage reason and any partial-save receipt join the existing navigation draft guard. Refresh warns while the reason or batch is unsaved, and the entire batch joins the save guard so lane, stage and task navigation remain unavailable until it finishes. Task fields and stage reasons cannot be changed during their save. Stage-level completion controls are hidden while a task panel is open, keeping the active work focused on that task.

Escape closes task options before returning from the panel. Returning respects the existing discard/save guard, restores focus to the originating task and restores the list position. A document or team dialog handles Escape independently; an in-flight save cannot be dismissed. A browser check identified that a disabled, just-saved button can release focus to the page body: Escape also returns from that state without affecting an open dialog. Menus reset when their task changes.

Below 1280 pixels, an open task uses a compact horizontal stage strip, keeping every stage reachable without a stack of full-size cards above the work. The stage overview retains its existing cards. All-not-applicable cards say "Not applicable" without a zero-range completion count; their tasks remain available for review.

Verification on 6 October 2026 extends the established navigation check rather than adding another phase command. It covers all three lanes, 89 catalogue tasks, 71 legacy aliases, stage states, partial failure/retry, stable audit scope, changed access, refreshed hard gates, reason retention, refresh warnings, nested dialogs and keyboard focus. The inline-work, simplification, operational, permission, atomic PostgreSQL, workflow-refresh and view-model checks also pass. Chrome verification uses the actual shared components with local fixture callbacks: all three lanes retain drafts after a failed save, recover on retry, enforce read-only controls, return by keyboard and retain saved answers after a real browser reload. Desktop and 390/320-pixel checks confirm compact stages and no page overflow. Screenshots are under `output/playwright/attorney-phase5-*-20261006.png`. The temporary preview files, browser and server are removed after verification.

The root `npm run check:app` verifies the final primary app source (lint, service tests, production build and login probe). Existing lint warnings remain. No Phase 5 migration, remote matter update, message or deployment is introduced. Release still requires Phase 3's task-comment migration and signed-in acceptance on an appropriate test matter in each lane, including real documents, lender instructions, permission changes and persisted progress. These local checks do not establish a live Tuckers release.


## Phase 6 production release — 6 October 2026

The primary transaction workspace is released at https://app.arch9.co.za with the shared task panel across transfer, bond and cancellation. Application release `6ef0787306593cd616a2fe4910245e82ed1a7aed` is served by READY Vercel deployment `dpl_DzcWPsdixfbMtc5NA8Pd2v1fhRhy`. Its candidate was built from the preceding live release, with unrelated active working-tree changes excluded. The new task-panel stylesheet loads with the attorney screen; the existing global CSS budget passes unchanged.

Production Supabase project `isdowlnollckzvltkasn` has the three append-only attorney migrations: `20261006143422` (matter-team workflow access), `20261006160000` (task-scoped internal comments) and `20261006221500` (private-comment compatibility for older matters without a derived summary). The third correction was required by an actual rolled-back Junoah save test. It permits only the three internal attorney-comment actions to operate without a summary. It does not create an invented summary, change task outcomes, expand comment/document permissions or relax the existing prerequisite for other canonical commands. Tests replay the real canonical command in isolated PostgreSQL across all three lanes.

The target guard and recovery lock passed with eight live backups. Exact dry runs contained only the reviewed attorney migrations, with no seeds or custom roles; the final database dry run is up to date. Function owners, grants and execution settings are preserved, and the security advisor reports no new findings. A full SQL rollback rehearsal restored the previous functions and removed the new objects inside a transaction, then rolled that rehearsal back.

Tuckers' existing actor now passes production workflow-edit checks for all three lanes. Its Junoah task-comment save, fresh read, stable retry and rejection of a changed retry passed inside a transaction that was rolled back. No verification comment, receipt or fabricated summary remains. This database test is separate from an authenticated browser walkthrough. Anonymous HTTP execution of the task-comment RPC is denied with `401 / 42501`.

Verification includes the full app check (zero lint errors; existing warnings remain), nine baseline service suites, 36 focused Vitest tests, navigation/drafts/partial-save recovery, task-specific fields, permission and real atomic-command checks, and the Vercel production build. The protected candidate's exact release marker, task-panel JavaScript and scoped CSS were verified before promotion. The live matter route serves the expected release, and all 784 critical asset status/type checks pass. Machine-readable verification and recovery evidence are in `tmp/attorney-workspace-release-20261006/` in the attached release worktree.

The available Chrome session is signed out; the live sign-in screen renders. Signed-in Tuckers desktop/mobile acceptance, actual document actions and save/reload on appropriate editable test matters remain pending. Earlier sections describe historical local checkpoints; this section records the current release status.
