# Workflow Engine Current State Audit

## 1. Executive Summary
- The transaction workflow is **DB-first** for core stage/state (`transactions.stage`, `transactions.current_main_stage`) with two existing workflow lanes in DB: `transaction_subprocesses` (`finance`, `attorney`) and `transaction_subprocess_steps`.
- Workflow progression is a mix of:
  - deterministic lane engines in code (`src/core/workflows/*`, `src/core/transactions/*Workflow.js`),
  - persisted lane step updates via API (`updateTransactionSubprocessStep` in `src/lib/api.js`),
  - stage syncing back to `transactions` (`advanceTransactionMainStageIfNeeded` in `src/lib/api.js`).
- Client portal now has a canonical service contract (`src/services/clientPortalWorkspaceService.js`) and normalized next actions/activity/notifications services.
- Attorney operations/scheduling are substantially DB-backed and operational, but there is **schema drift risk**: some attorney assignment logic depends on `transaction_attorney_assignments`, which is created in standalone SQL files (`sql/20260509_transaction_attorney_assignments.sql`) and not clearly consolidated into baseline `sql/schema.sql`.
- There is **no dedicated `transaction_tasks` table**. Operational “tasks” are split across `transaction_checklist_items`, `document_requests`, appointment workflows, and legacy lead-level `tasks`.

## 2. Current Transaction Stage Model

### Where the main transaction stage is stored (Q1)
- DB table: `transactions`
- Key columns:
  - `stage` (detailed stage)
  - `current_main_stage` (macro stage)
  - `current_sub_stage_summary`
- References:
  - `sql/schema.sql` (`transactions_*_check` constraints)
  - stage normalization/mapping: `src/lib/stages.js`, `src/core/transactions/stageConfig.js`

### Current stage/status values (Q2)
- Detailed `stage` values constrained in DB (includes legacy variants):
  - `Available`, `Reserved`, `OTP Signed`, `Deposit Paid`, `Finance Pending`, `Bond Approved / Proof of Funds`, `Proceed to Attorneys`, `Transfer in Progress`, `Transfer In Progress`, `Transfer Lodged`, `Registered`
- Main stage values:
  - `AVAIL`, `DEP`, `OTP`, `FIN`, `ATTY`, `XFER`, `REG`
- Additional state dimensions:
  - `attorney_stage` (`instruction_received`..`registered`)
  - `lifecycle_state` (`active`, `registered`, `completed`, `archived`, `cancelled`)
  - `operational_state` and `waiting_on_role`

### Workflow/subprocess table/service existence (Q3)
- Yes.
- Tables:
  - `transaction_subprocesses`
  - `transaction_subprocess_steps`
- Service/API orchestration:
  - `ensureTransactionSubprocesses`
  - `updateTransactionSubprocessStep`
  - `completeTransactionSubprocess`
  - `deriveStageFromSubprocesses`
  - all in `src/lib/api.js`

### Linear vs parallel vs status fields (Q4)
- Hybrid model:
  - `transactions.stage/current_main_stage` = macro status fields.
  - `transaction_subprocesses` = **parallel lane model** (finance + attorney lanes), each with ordered steps.
  - Lane progression is sequential per lane (`assertGuidedSubprocessSequentialTransition` path in `updateTransactionSubprocessStep`).

### Files controlling transaction progression (Q5)
- `src/lib/api.js`
  - `advanceTransactionMainStageIfNeeded`
  - `updateTransactionSubprocessStep`
  - `completeTransactionSubprocess`
  - onboarding submits that auto-advance stages
- `src/core/transactions/financeWorkflow.js`
- `src/core/transactions/transferWorkflow.js`
- `src/core/workflows/definitions.js`
- `src/core/workflows/engine.js`

### Components displaying progress (Q6)
- `src/pages/UnitDetail.jsx`
- `src/pages/AttorneyTransactionDetail.jsx`
- `src/components/TransactionProgressPanel.jsx`
- `src/components/SubprocessWorkflowPanel.jsx`
- `src/components/AttorneyStageWorkflowPanel.jsx`
- `src/pages/ClientPortal.jsx`
- `src/pages/ClientModulePage.jsx`
- `src/pages/ExternalTransactionPortal.jsx`

### Buyer/seller/finance/transfer/bond workflows separated or combined (Q7)
- Combined macro transaction with separated subdomains:
  - Macro: `transactions.stage/current_main_stage`
  - Lanes: finance + attorney (transfer)
  - Buyer/seller onboarding/docs handled via requirement engines and portal context, not standalone lane tables.
  - Bond attorney/transfer attorney assignment separated in attorney assignment model (service-level), but finance lane remains a single lane with finance-type branching.

### DB-first vs local/mock-derived (Q8)
- Primary path is DB-first.
- Fallbacks exist:
  - demo/mock attorney data (`src/core/transactions/attorneyMockData.js`, consumed in `fetchTransactionById`/`fetchUnitDetail`/`fetchDevelopmentDetail` in `src/lib/api.js`)
  - default in-memory subprocess state returned when schema missing (`ensureTransactionSubprocesses`).

## 3. Current Subprocess/Lane Model

### Existing subprocesses for finance/transfer/bond/handover (Q9)
- Explicit subprocess lanes currently in DB:
  - `finance`
  - `attorney` (transfer legal lane)
- No separate subprocess rows for `handover`, `bond_attorney`, `registration` lanes yet.

### Where subprocesses are stored (Q10)
- `transaction_subprocesses`
- `transaction_subprocess_steps`

### Subprocess fields (Q11)
- `transaction_subprocesses`: `id`, `transaction_id`, `process_type`, `owner_type`, `status`, timestamps.
- `transaction_subprocess_steps`: `id`, `subprocess_id`, `step_key`, `step_label`, `status`, `completed_at`, `comment`, `owner_type`, `sort_order`, timestamps.

### Linked to transactions/role players (Q12, Q13)
- Linked to transactions: yes (`transaction_id` FK).
- Role/owner linkage:
  - lane ownership via `owner_type` (`bond_originator`, `attorney`, `internal`),
  - edit control via `transaction_participants` permission flags + workflow permission resolver.

### Visible in client portal/editable by role/used in dashboards (Q14–Q16)
- Client portal visibility: yes (`fetchClientPortalByToken` returns `subprocesses`; rendered in portal pages).
- Role editability: yes, enforced in `updateTransactionSubprocessStep` + `resolveWorkflowLanePermissions`.
- Dashboard/workspace usage: yes in Unit/Attorney/Client views and progress panels.

## 4. Current Attorney Workflow State

### Where attorney workflow is defined (Q17)
- Stage definitions and workflow UI logic:
  - `src/core/transactions/transferWorkflow.js`
  - `src/core/workflows/definitions.js` (`TRANSFER_STAGE_DEFINITIONS`)
  - `src/core/transactions/attorneyOperationalEngine.js` (operational checklist/request model)

### Transfer workflow and bond attorney workflow existence (Q18, Q19)
- Transfer workflow: yes (attorney subprocess lane + operational stage model).
- Bond attorney workflow: partially modeled via attorney assignment type and scheduling queues; no standalone DB subprocess lane named `bond_attorney`.

### Transfer vs bond attorney separated in code (Q20)
- Yes, in assignment/service layer:
  - `assignment_type`: `transfer`, `bond`, `transfer_and_bond`
  - service: `src/services/transactionAttorneyAssignments.js`
  - attorney operations queue distinguishes transfer/bond matter types.

### Attorney workspace and appointment/signing queue files (Q21, Q22)
- Workspace pages:
  - `src/pages/AttorneyOperationsPage.jsx`
  - `src/pages/AttorneySchedulingPage.jsx`
  - `src/pages/AttorneyTransactionDetail.jsx`
- Queue/workspace components:
  - `src/components/attorney/operations/AttorneyAppointmentQueue.jsx`
  - `src/components/attorney/scheduling/AttorneySchedulingWorkspace.jsx`
  - plus Today/Transfer/Bond queue components in same folder.

### Mock vs Supabase data usage (Q23, Q24)
- Supabase is primary.
- Mock paths exist for attorney demo records:
  - `getAttorneyMockTransactionDetail*` / `getAttorneyMockDevelopmentDetail`
  - consumed by `fetchTransactionById`, `fetchUnitDetail`, `fetchDevelopmentDetail`.

### What breaks if attorney workflow data missing (Q25)
- Many paths fail safely with fallback shells/default arrays.
- But if required tables are missing, user-facing errors appear for writes (e.g., “run sql/schema.sql first”).
- Specific risk: `transaction_attorney_assignments` may be missing if migration not applied (service expects it).

## 5. Current Finance/Bond Workflow State

### Where defined + stages (Q26, Q27)
- Finance workflow definition:
  - `src/core/transactions/financeWorkflow.js`
  - `src/core/workflows/definitions.js` (`FINANCE_STAGE_DEFINITIONS` for `cash`, `bond`, `combination`)
- Finance lane persists through subprocess steps (`process_type='finance'`).

### Bond approval/grant status storage (Q28)
- Stored across:
  - `transaction_finance_details` (`bond_approved`, `grant_signed`, etc.)
  - finance subprocess steps (`bond_approved`, `guarantees_grant_issued` style keys)
  - transaction stage (`Finance Pending`, `Bond Approved / Proof of Funds`) and events.

### OOBA/bond originator assignment storage (Q29)
- Core transaction fields: `transactions.bond_originator`, `assigned_bond_originator_email`.
- Participant layer: `transaction_participants` role `bond_originator`.
- Legacy role-player table: `transaction_role_players` (`bond_originator` type).

### Does bond approval trigger anything (Q30)
- Yes, indirectly:
  - finance lane completion/step progression can trigger stage progression/handoffs via `advanceTransactionMainStageIfNeeded` and workflow updates.
  - notifications/events emitted through transaction event/notification helpers.

### Link finance workflow to bond attorney workflow (Q31)
- Not a strict dedicated bond-attorney subprocess link yet.
- Current linkage is through:
  - assignment model (`transaction_attorney_assignments` service)
  - transaction fields/participants
  - appointments and attorney scheduling layers.

### Files handling bond originator dashboards/workspaces (Q32)
- Role currently uses shared transaction/unit workspaces plus role filtering:
  - routes in `src/App.jsx` (`/applications`, `/transactions`, `/units` for `bond_originator`)
  - role-accessed transaction APIs via `getTransactionsByParticipant(... roleType:'bond_originator')` in `src/core/transactions/service.js`.
- Dedicated standalone bond-originator operations page is not clearly separate in this repo snapshot.

## 6. Current Document Workflow State

### Where transaction docs / required docs / uploads are stored (Q33–Q35)
- Uploaded docs: `documents`.
- Required docs: `transaction_required_documents` (and rule/template tables).
- Request-driven docs: `document_requests` and `document_request_groups`.

### Client-requested vs role-player docs distinction (Q36)
- Yes:
  - `document_requests.assigned_to_role`, `requested_from`, `request_type`, `visibility_scope`.
  - `documents.uploaded_by_role`, `uploaded_by_user_id`, visibility columns.

### Attorney-uploaded docs support (Q37)
- Yes, via document upload + role metadata fields in `documents`; attorney workspaces use this.

### Specific doc types support (Q38)
- Supported as either:
  - `document_type`/`category` values in `documents`/`document_requests`,
  - closeout document definitions in attorney/bond closeout tables (`*_closeout_documents`),
  - workflow checklist/request items in operational engine.
- There is not one hardcoded enum only for all requested keys, but the system supports extending/recording these document types.

### Linked to stages/tasks/visibility (Q39–Q41)
- Stage linkage: yes (`documents.stage_key`, checklist stage fields, workflow event associations).
- Task linkage: yes via `transaction_checklist_items.linked_document_request_id` / `linked_document_id` and `document_requests` lifecycle.
- Visibility scoped: yes (`documents.visibility_scope`, `is_client_visible`; `transaction_required_documents.visibility_scope`; `document_requests.visibility_scope`).

## 7. Current Task / Operational Step State

### `transaction_tasks` table and task engine (Q42, Q43)
- `transaction_tasks` table: **No**.
- There is a task-like operational engine via:
  - `transaction_checklist_items`
  - `document_requests`
  - transaction lane steps (`transaction_subprocess_steps`).
- Legacy non-transaction tasks table exists: `tasks` (lead-centric CRM follow-ups).

### Generated vs manual tasks (Q44, Q45)
- Generated:
  - checklist seeding by stage (`ensureTransactionChecklistItems` + `buildDefaultChecklistItemsForStage`).
- Manual:
  - additional document requests and status updates via document request APIs.
  - lead/pipeline manual tasks in `tasks`.

### Linked to role players (Q46)
- Yes:
  - checklist `owner_role`, `owner_user_id`
  - document requests `assigned_to_role`, `assigned_to_user_id`
  - lane edit permissions from participant role/permissions.

### Visible in workspaces/portal (Q47, Q48)
- Attorney/bond/agent/internal workspaces: yes (checklist + requests + subprocess/next action views).
- Client portal: yes, transformed into `nextActions` and `documentCenter` via canonical portal service.

### Task/status values + managing files (Q49, Q50)
- Checklist status: `pending`, `in_progress`, `completed`, `blocked`, `waived`.
- Document request status: `requested`, `uploaded`, `under_review`, `reviewed`, `rejected`, `completed`, `cancelled`.
- Subprocess step status: `not_started`, `in_progress`, `completed`, `blocked`.
- Lead-task status (`tasks`): `Pending`, `Completed`, `Overdue`, `Cancelled`.
- Managing files:
  - `src/lib/api.js` (checklist/document request CRUD)
  - `src/core/transactions/attorneyOperationalEngine.js`
  - `src/services/attorneyOperations.js`
  - `src/pages/agency/AgencyPipelinePage.jsx` (lead tasks)

## 8. Current Role Player Assignment Model

### Storage + assignment paths (Q51–Q56)
- `transaction_participants`: primary participant + permission model (developer/agent/attorney/bond/client/buyer/seller/internal).
- `transaction_role_players`: partner snapshot model (`bond_originator`, `bond_attorney`, `transfer_attorney`).
- `transaction_attorney_assignments`: dedicated attorney assignment table (created by `sql/20260509_transaction_attorney_assignments.sql`; consumed by `src/services/transactionAttorneyAssignments.js`).
- Assignment behavior:
  - Agent/developer/bond/attorney defaults seeded in `buildDefaultParticipantRows` / `ensureTransactionParticipants` (`src/lib/api.js`).
  - Attorney assignment CRUD in `src/services/transactionAttorneyAssignments.js`.

### Same firm for transfer and bond / different firms (Q57, Q58)
- Supported by design through assignment types and records:
  - same firm possible with `transfer_and_bond`
  - different firms possible with separate `transfer` and `bond` assignments.

### Assignment managers + workspace access (Q59, Q60)
- Assignment services:
  - `src/services/transactionAttorneyAssignments.js`
  - participant seeding/permissions in `src/lib/api.js`
- Workspace access control:
  - role route gating in `src/App.jsx`
  - transaction-level access in `getAccessibleTransactionIdsForUser` / `canUserAccessTransaction` (`src/lib/api.js`)
  - participant permission columns drive lane edit rights.

## 9. Current Client Portal Workflow Visibility

### What appears in client portal now (Q61–Q64)
- From canonical workspace service `getClientPortalWorkspaceData`:
  - lifecycle/stage
  - normalized document center
  - normalized next actions
  - normalized activity feed
  - notifications
  - appointments
  - role-player summaries
  - educational content

### Internal vs client-visible filtering (Q65)
- Implemented in service layer:
  - document/additional request visibility filtering (`client_visible` logic)
  - activity feed visibility filtering (`filterClientVisibleActivity`)
  - notification visibility normalization.

### Buyer vs seller view separation (Q66)
- Yes:
  - workspace resolution (`buying`, `selling`, `shared`) from `resolveClientPortalContext` and workspace resolver in `clientPortalWorkspaceService`.

### Finance/transfer/bond/registration progress differentiation (Q67)
- Partial:
  - stage and subprocess context available and rendered.
  - no fully separate lane cards for every domain in all portal views yet, but data exists for differentiation.

### Service building portal data contract (Q68)
- `src/services/clientPortalWorkspaceService.js` (`getClientPortalWorkspaceData`).

## 10. Current Activity / Notification Model

### Tables + event creation (Q69–Q73)
- DB tables:
  - `transaction_events`
  - `transaction_notifications`
  - client portal notifications (`client_portal_notifications` handled in API/service layer)
  - appointment notification tables (`appointment_notification_events`, `appointment_reminders`).
- Event creation is wired across stage/document/appointment/update flows in `src/lib/api.js` and appointment services.

### Client-visible filtering + notification durability (Q74, Q75)
- Client-visible filtering: yes in client portal activity feed service.
- Notifications:
  - transaction notifications are DB-backed.
  - client portal notifications are DB-backed via notification service + API upsert/read/update helpers.

### Managing files (Q76)
- `src/lib/api.js`
- `src/services/clientPortalActivityFeedService.js`
- `src/services/clientPortalNotificationsService.js`
- `src/services/appointmentNotificationService.js`

## 11. Existing Tables That Can Be Reused
- `transactions`
- `transaction_subprocesses`
- `transaction_subprocess_steps`
- `transaction_participants`
- `transaction_events`
- `transaction_notifications`
- `transaction_readiness_states`
- `documents`
- `transaction_required_documents`
- `document_requests`
- `document_request_groups`
- `transaction_checklist_items`
- `transaction_role_players`
- `transaction_finance_details`
- `client_portal_links`
- `client_portal_contexts`
- appointment tables: `appointments`, `appointment_participants`, `appointment_reschedule_requests`, `appointment_resources`, `appointment_notification_events`, `appointment_reminders`
- attorney ops tables: `attorney_firms`, `attorney_firm_departments`, `attorney_firm_members`, `attorney_firm_invitations`
- attorney/bond closeout tables.

## 12. New Tables Needed (If Building Full Workflow Engine Lanes)
- Not mandatory for v1 lane engine (current tables can carry most requirements).
- High-value additions if you want fully explicit orchestration:
  - `workflow_templates` (template metadata)
  - `workflow_template_steps` (step definitions by lane/type)
  - `transaction_workflow_runs` (versioned workflow instance per transaction)
  - `transaction_workflow_tasks` (if you want explicit “task” entity distinct from checklist/request)
  - `workflow_transition_log` (auditable transitions + blockers).

## 13. Recommended Safe Implementation Order
1. Consolidate schema parity first:
   - ensure all relied-on tables/columns exist in baseline migrations (especially `transaction_attorney_assignments` consistency).
2. Freeze canonical enums/statuses in one place:
   - stage values, subprocess statuses, request/checklist statuses, visibility values.
3. Keep `transactions` + subprocesses as system of record:
   - avoid introducing parallel transient workflow state.
4. Add template layer on top of existing subprocess/checklist/request models.
5. Add stricter transition guards + idempotent event emission.
6. Extend client portal projections from existing canonical service contract.

## 14. Overnight Implementation Opportunities
- Centralize workflow constants into one shared contract module and update references.
- Add API-level schema guards + explicit warnings for known drift points.
- Add non-breaking read models for lane readiness and blockers from existing tables.
- Improve dedupe keys for notifications/events where not already strict.

## 15. Risks / Things Not To Touch Yet
- Do not replace `transactions.stage/current_main_stage` abruptly; many routes/components depend on them.
- Do not remove existing subprocess logic; it is already used in Unit/Attorney/Client views.
- Do not merge attorney assignment and participant models without a transition plan.
- Avoid large RLS rewrites without table-by-table policy tests.
- Avoid introducing a separate runtime-only task cache for transaction workflow.
- Biggest risk (Q84): creating a second “truth” for workflow (new lane engine state that diverges from `transactions` + subprocess + checklist/request).
- Safe first implementation step (Q83): schema parity + enum normalization + service-level read model hardening.
- Avoid until manual review (Q86): destructive migration changes on transaction core columns, participant uniqueness/role constraints, and legacy compatibility fallbacks.

## 16. Workflow Engine Feasibility Answers (Q77–Q86)
- **Best place for workflow templates (Q77):** `src/core/workflows/definitions.js` + DB-backed template tables later.
- **Tables reusable (Q78):** subprocess/checklist/request/participant/event/notification stack listed above.
- **New tables likely needed (Q79):** template + run + task + transition log tables (section 12).
- **Service files to create (Q80):** `workflowTemplateService`, `workflowRunService`, `workflowTaskService`, `workflowTransitionService`.
- **Code to preserve (Q81):** `updateTransactionSubprocessStep`, `ensureTransactionSubprocesses`, client portal canonical workspace service, attorney ops services.
- **Code to deprecate gradually (Q82):** ad-hoc duplicated component-level workflow derivations where canonical services already exist.
- **Safest first step (Q83):** schema parity + status/role normalization + read model hardening.
- **Biggest lane risk (Q84):** dual-state divergence and migration regressions.
- **Overnight safe wins (Q85):** guardrails, normalization, report/read-model utilities, dedupe hardening.
- **Avoid until reviewed (Q86):** major transaction schema rewrites, cross-module RLS overhauls, and replacing legacy routes in one pass.

## 17. Files Reviewed
- `/Users/alexanderlandman/the-it-guy/the-it-guy/sql/schema.sql`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/sql/20260509_transaction_attorney_assignments.sql`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/sql/20260509_attorney_permission_visibility_hardening.sql`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/api.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/stages.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/core/transactions/stageConfig.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/core/transactions/roleConfig.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/core/transactions/financeWorkflow.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/core/transactions/transferWorkflow.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/core/transactions/attorneyOperationalEngine.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/core/workflows/definitions.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/core/workflows/engine.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/core/workflows/events.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/core/workflows/permissions.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/clientPortalWorkspaceService.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/clientPortalNextActionsEngine.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/clientPortalActivityFeedService.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/clientPortalNotificationsService.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/attorneyOperations.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/transactionAttorneyAssignments.js`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/UnitDetail.jsx`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/AttorneyTransactionDetail.jsx`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/AttorneyOperationsPage.jsx`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/AttorneySchedulingPage.jsx`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/components/attorney/operations/AttorneyAppointmentQueue.jsx`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/components/attorney/scheduling/AttorneySchedulingWorkspace.jsx`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/ClientPortal.jsx`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/ClientModulePage.jsx`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/components/TransactionProgressPanel.jsx`
- `/Users/alexanderlandman/the-it-guy/the-it-guy/src/App.jsx`
