# Attorney Incoming Matter Queue Contract

Phase 1 defines the product and data contract for the attorney `Incoming Matters` queue. It does not replace the current `/attorney/matters/active` screen yet.

## Product Rule

`Incoming Matters` is an intake queue for transfer instructions that have not become active attorney matters yet.

The default queue starts when buyer onboarding has been submitted or when the attorney intake has a concrete post-submission blocker. Pre-submission states are tracked by the contract but should not appear in the default queue unless a later view explicitly asks for them.

## Statuses

| Status | Meaning | Default Incoming Queue |
| --- | --- | --- |
| `new_instruction` | Transfer attorney was selected, but buyer intake has not progressed enough for attorney action. | No |
| `awaiting_client_onboarding` | Buyer onboarding has been sent or started, but not submitted. | No |
| `awaiting_signed_otp` | Buyer onboarding is submitted. The transaction is waiting for OTP generation, release, signature, or signed OTP upload. | Yes |
| `awaiting_documents` | Signed OTP or onboarding is far enough along, but required documents are still open or rejected. | Yes |
| `ready_for_acceptance` | Signed OTP is received and no open document blockers remain. Attorney can accept/open the matter. | Yes |
| `accepted` | Attorney accepted the instruction. It should leave Incoming and appear as an active matter. | No |
| `declined` | Attorney declined the instruction. | No |
| `removed` | Assignment/instruction was removed or cancelled. | No |
| `completed` | Attorney instruction has completed. | No |

## Waiting-On Buckets

Rows can show more than one blocker:

- `buyer_onboarding`
- `signed_otp`
- `documents`
- `attorney_acceptance`
- `instruction_review`

Example: a row with buyer onboarding submitted and a requested FICA document should have status `awaiting_signed_otp` and waiting-on buckets `signed_otp` plus `documents`.

## Data Signals

The contract is implemented in `src/core/transactions/attorneyIncomingMatterContract.js`.

It expects Phase 2 read models to provide:

- `transaction_attorney_assignments.instruction_status`
- `transaction_attorney_assignments.assignment_status`
- `transaction_attorney_assignments.assignment_type`
- `transaction_attorney_assignments.attorney_role`
- `transactions.onboarding_status`
- `transactions.onboarding_completed_at`
- `transactions.external_onboarding_submitted_at`
- `transactions.current_main_stage`
- `transaction_onboarding.status`
- `transaction_onboarding.submitted_at`
- relevant `document_requests`

## Phase 2 Read Model

Implemented in `src/services/attorneyIncomingMatterQueue.js`.

`getAttorneyIncomingMatterQueue()` builds a dedicated read model instead of reusing the generic attorney `matterQueue`. It reads transfer attorney assignments, transaction onboarding signals, onboarding rows, document requests, party/property context, and assignee profiles, then applies the contract to decide:

- whether a transfer assignment appears in Incoming
- what status label to display
- what the row is waiting on
- whether a row should move to Active Matters

The pure mapper `buildAttorneyIncomingMatterQueueFromSources()` is covered by `npm run test:attorney-incoming-matter-queue`. It deliberately excludes bond and cancellation assignments from `Incoming Matters`, including legacy rows where `attorney_role` is absent and only `assignment_type` is available.

The current UI has not been switched over yet. That remains a later phase so we can change the screen wiring without mixing it into the data-contract work.

## Phase 3 Plumbing

Implemented in `src/services/attorneyIncomingMatterInstructionSync.js`, `src/lib/api.js`, and `supabase/migrations/202607090002_attorney_incoming_instruction_sync.sql`.

Buyer onboarding submission now syncs matching transfer attorney assignments to `instruction_status = 'awaiting_signed_otp'`. Signed OTP receipt syncs them to `ready_for_acceptance`. The sync deliberately skips bond/cancellation assignments and any transfer instruction that has already been accepted, declined, removed, or completed.

The migration adds the allowed `instruction_status` constraint, an incoming-transfer index, a transaction trigger for future self-healing, and a backfill for existing transfer assignments whose transaction already has submitted onboarding or signed-OTP signals.

Regression coverage:

- `npm run test:attorney-incoming-matter-sync`
- `npm run test:attorney-incoming-matter-queue`

## Phase 4 Workspace Integration

Implemented in `src/services/attorneyMatterWorkspace.js`.

The existing attorney matters page still calls `getAttorneyMatterWorkspace()`, but the `active` route now receives `incomingMatterQueue` from `getAttorneyIncomingMatterQueue()` and adapts those rows into the existing table model. This prevents `Incoming Matters` from falling back to the generic active/all-matters queue.

The workspace adapter keeps the current table chrome but changes the data semantics for the incoming view:

- status filters become incoming statuses (`awaiting_signed_otp`, `awaiting_documents`, `ready_for_acceptance`)
- KPIs count incoming blockers instead of active/registered matter milestones
- empty incoming queues stay empty instead of showing generic active matters

Regression coverage:

- `npm run test:attorney-matter-workspace-incoming`

## Phase 5 Intake Screen

Implemented in `src/pages/AttorneyMattersPage.jsx` and `src/services/attorneyMatterWorkspace.js`.

The `Incoming Matters` route now renders a dedicated intake table instead of the generic matter register table. The visible queue focuses on the transfer instruction state:

- waiting-on buckets such as signed OTP, documents, and attorney acceptance
- document blocker counts
- incoming date and age in the queue
- incoming-specific row actions such as opening the transfer, following up OTP, requesting documents, assigning the attorney, and emailing the client

The workspace payload also switches saved views and quick filters to incoming concepts. Empty incoming queues keep incoming KPIs instead of falling back to active/lodgement/registration widgets.

Regression coverage:

- `npm run test:attorney-incoming-matter-ui`
- `npm run test:attorney-matter-workspace-incoming`

## Phase 6 Acceptance Handoff

Implemented in `src/services/attorneyIncomingMatterInstructionActions.js`, `src/lib/api.js`, `src/pages/AttorneyMattersPage.jsx`, and `supabase/migrations/202607090003_attorney_incoming_acceptance_metadata.sql`.

`Ready For Acceptance` rows can now be accepted from the incoming queue. Acceptance is deliberately modeled as a workflow command, not as another passive sync:

- only transfer attorney assignments can be accepted from this queue
- only `ready_for_acceptance` instructions can be accepted
- accepted instructions set `instruction_status = 'accepted'`
- the assignment remains `active` so it appears in the attorney operational matter workspace
- the linked transaction is moved into attorney preparation (`current_main_stage = 'ATTY'`, `attorney_stage = 'instruction_received'`)
- acceptance metadata is stamped when the new audit columns are present

The UI refreshes the incoming queue after acceptance, so the accepted row leaves Incoming and can be opened from the active transfer matter workspace.

Regression coverage:

- `npm run test:attorney-incoming-matter-actions`
- `npm run test:attorney-incoming-matter-ui`
- `npm run test:attorney-matter-workspace-incoming`

## Phase 7 Decline Path

Implemented in `src/services/attorneyIncomingMatterInstructionActions.js`, `src/lib/api.js`, `src/pages/AttorneyMattersPage.jsx`, and `supabase/migrations/202607090004_attorney_incoming_decline_metadata.sql`.

Incoming transfer instructions can now be declined from the queue with a reason. Decline is also modeled as a workflow command:

- only transfer attorney assignments can be declined from this queue
- accepted instructions cannot be declined
- declined instructions set `instruction_status = 'declined'`
- the assignment is marked `removed` so it does not become active attorney matter work
- the linked transaction receives the decline reason as its next action/comment for reassignment review
- decline metadata is stamped when the new audit columns are present

The UI opens a reason dialog from the incoming row menu, then refreshes the queue after the decline succeeds so the row leaves Incoming.

Regression coverage:

- `npm run test:attorney-incoming-matter-actions`
- `npm run test:attorney-incoming-matter-ui`
- `npm run test:attorney-matter-workspace-incoming`

## Phase 8 Decision Audit Trail

Implemented in `src/services/attorneyIncomingMatterInstructionActions.js`, `src/lib/api.js`, and `supabase/migrations/202607090005_attorney_incoming_decision_events.sql`.

Acceptance and decline now write a `transaction_events` audit row after the assignment and transaction updates succeed:

- `AttorneyIncomingInstructionAccepted`
- `AttorneyIncomingInstructionDeclined`

The event payload includes the transaction, assignment, actor, decision status, decision note/reason, source, and decision timestamp. These events are internal-only activity records and are intended for operational review, timeline history, and future reporting on accepted/declined transfer instructions.

For older environments where the event table, optional event columns, or new event-type constraint are not available yet, the decision command still completes. If only the event-type constraint is stale, the client records a `TransactionUpdated` event with the original incoming-decision event type preserved in `event_data.originalEventType`.

Regression coverage:

- `npm run test:attorney-incoming-matter-actions`

## Exit Rule

An incoming row leaves the default queue when:

- `instruction_status = 'accepted'`
- `instruction_status = 'declined'`
- the assignment is removed/completed
- a later explicit product rule marks it no longer actionable

Accepted rows should be handled by the active attorney matter/lane workflow, not by the incoming queue.
Declined rows should be handled by reassignment or manual review outside the incoming attorney work queue.
