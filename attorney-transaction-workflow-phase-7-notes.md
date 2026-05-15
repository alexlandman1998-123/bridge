# Attorney Transaction Workflow Phase 7 Notes

## Executive Summary

Phase 7 adds structured attorney updates, safe internal notes, professional shared updates, explicit client-visible updates, and a unified legal activity timeline. Updates are now role-aware, transaction-aware, entity-aware, lane-linked, permission-checked, and filtered by visibility.

This phase does not add automated messaging, reporting exports, readiness scoring, or AI-generated updates.

## Implemented Files

- `the-it-guy/src/constants/attorneyUpdateTypes.js`
- `the-it-guy/src/services/attorneyWorkflow/attorneyWorkflowLaneService.js`
- `the-it-guy/src/services/attorneyWorkflow/attorneyWorkflowService.js`
- `the-it-guy/src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx`
- `the-it-guy/src/services/clientPortalActivityFeedService.js`
- `the-it-guy/scripts/verify-attorney-update-types.mjs`
- `supabase/migrations/202605150003_attorney_workflow_lanes.sql`

## Attorney Update Registry

Added a central registry for attorney updates.

Update types include:

- transfer updates
- bond updates
- cancellation updates
- company entity updates
- trust entity updates
- individual/marital updates

Each update type includes:

- `id`
- `label`
- `category`
- `attorneyRole`
- `laneKey`
- `defaultVisibility`
- `clientVisibleAllowed`
- `requiresNote`
- `appliesWhen`

The registry filters by:

- finance type
- transaction type
- buyer entity type
- seller entity type
- cancellation requirement
- attorney role

## Visibility Model

Supported visibility levels remain:

- `internal`
- `professional_shared`
- `client_visible`

Internal notes default to `internal` and cannot be made client-visible.

Client-visible updates must be explicitly selected and must pass permission checks. Sensitive update types, such as outstanding bank conditions, cannot be published to clients.

## Service Layer

Added or updated service behavior:

- `getAttorneyUpdateOptionsForTransaction(transactionId, attorneyRole)`
- `addAttorneyTransactionUpdate(...)`
- compatibility wrapper: `addAttorneyWorkflowLaneUpdate(...)`

The update service:

- validates the update type applies to the transaction
- validates lane and attorney role
- validates visibility permissions
- links updates to lane, document id, and signing packet id when supplied
- logs transaction activity
- returns the refreshed attorney operations model

## Legal Activity Timeline

The attorney workflow service now returns `legalTimeline`.

Timeline sources include:

- attorney lane updates
- internal attorney notes
- lane stage history
- document request/review activity

Each timeline item includes:

- title
- message
- actor
- timestamp
- lane
- attorney role
- visibility
- related document/signing ids when available

Timeline filters:

- All
- Transfer
- Bond
- Cancellation
- Documents
- Signing
- Internal
- Professional Shared
- Client Visible

## UI Integration

The attorney workflow lanes panel now supports:

- grouped update type dropdowns
- separate internal note action
- visibility selector
- client-visible warning copy
- timeline filtering
- visibility badges
- lane badges

Actions remain permission-gated from the Phase 5 permission service.

## Client Portal Safety

The client portal activity feed now reads `event_data` as well as `metadata`, so client-visible attorney updates render cleanly.

Filtering still only allows `client_visible` events through the client feed. Internal and professional-shared attorney updates remain excluded.

## Migration Notes

The local migration adds optional update metadata fields:

- `related_document_id`
- `related_signing_packet_id`
- `client_recipients`

The `transaction_attorney_lane_updates.update_type` constraint is relaxed to accept central registry update ids instead of only generic update buckets.

This migration is local and has not been applied to the linked Supabase project by this phase.

## QA Fixtures

Added `scripts/verify-attorney-update-types.mjs`.

Covered scenarios:

- transfer attorney sees transfer options on cash transactions
- cash transaction does not return bond/cancellation update options
- bond company transaction returns bond and company authority updates
- trust/cancellation transaction returns trust and cancellation options
- sensitive bank condition update metadata remains non-client-visible

## Verification Results

`node scripts/verify-attorney-update-types.mjs`

Result: passed.

Targeted lint:

`npx eslint src/constants/attorneyUpdateTypes.js src/services/attorneyWorkflow/attorneyWorkflowLaneService.js src/services/attorneyWorkflow/attorneyWorkflowService.js src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx src/services/clientPortalActivityFeedService.js scripts/verify-attorney-update-types.mjs`

Result: passed.

`npm run build`

Result: passed.

Known existing build warnings:

- Vite CSS minify warning for generated CSS around `-: TZ.;`
- large bundle chunk warning

`npm run lint`

Result: failed due to existing repo-wide lint debt.

Known existing lint shape:

- 126 problems
- 95 errors
- 31 warnings
- existing unused variables, React hook/compiler issues, unresolved names in `src/lib/api.js`, and temporary spec globals

No targeted Phase 7 lint errors were found.

## Phase 8 Readiness

Phase 7 gives the next phase a safe communication layer:

- legal updates are no longer generic comments
- attorneys see relevant update options only
- internal notes remain internal
- professional updates are separated from client-visible updates
- clients only receive explicitly client-visible legal activity
- the legal timeline can be reused in dashboards and transaction views

