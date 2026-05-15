# Attorney Transaction Workflow Phase 8 Notes

## Executive Summary

Phase 8 adds the attorney readiness and blocker intelligence layer. Bridge can now calculate lane-level readiness, matter-level readiness, lodgement readiness, registration readiness, automatic blockers, manual blockers, next actions, at-risk signals, and ready-for-lodgement queue data.

This phase does not send reminders, generate legal advice, redesign dashboards, or integrate external systems.

## Implemented Files

- `the-it-guy/src/services/attorneyWorkflow/attorneyReadinessEngine.js`
- `the-it-guy/src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx`
- `the-it-guy/scripts/verify-attorney-readiness.mjs`
- `supabase/migrations/202605150003_attorney_workflow_lanes.sql`

## Readiness Engine

Added:

- `calculateAttorneyReadiness(transactionId)`
- `calculateAttorneyReadinessForOperations(operations, manualBlockers)`
- `detectAttorneyBlockers(transactionId)`
- `getAttorneyNextActions(transactionId)`
- `calculateLodgementReadiness(transactionId)`
- `calculateRegistrationReadiness(transactionId)`
- `getReadyForLodgementMatters(firmId)`
- `summarizeAttorneyReadinessForManagement(readinessRows)`

Readiness returns:

- overall readiness
- transfer readiness
- bond readiness when required
- cancellation readiness when required
- lodgement readiness
- registration readiness
- blockers
- next actions
- at-risk state
- ready/near-ready for lodgement state

## Scoring Model

The scoring is intentionally simple and explainable:

- workflow stage progress: 40
- documents: 25
- signatures: 20
- blockers: 10
- assignment: 5

Each lane returns a `scoreBreakdown` so the UI can explain why a matter is or is not ready.

## Blocker Engine

Automatic blockers include:

- missing attorney assignment
- missing required documents
- rejected documents
- unsigned transfer documents
- unsigned bond documents
- cancellation signing/document gaps
- blocked workflow lanes
- inactive matters with no lane activity for 10+ days

Blocker categories include:

- `missing_document`
- `rejected_document`
- `unsigned_document`
- `missing_assignment`
- `inactive_matter`
- `manual_blocker`
- `dependency_not_met`

Severity levels:

- `low`
- `medium`
- `high`
- `critical`

## Manual Blockers

Added manual blocker support:

- `addAttorneyManualBlocker(...)`
- `resolveAttorneyManualBlocker(...)`
- `reopenAttorneyManualBlocker(...)`
- `getAttorneyManualBlockers(transactionId)`

Manual blockers include:

- title
- description
- lane key
- attorney role
- severity
- owner
- visibility
- due date
- created/resolved metadata

Manual blocker actions are permission checked and activity logged.

## Lodgement And Registration Readiness

Lodgement readiness considers required attorney lanes, lane progress, blockers, assignments, document completion, and signing state.

Registration readiness checks whether required transfer, bond, and cancellation lanes have reached their final registration stages.

Cash matters exclude bond readiness. Cancellation readiness applies only when cancellation is required.

## UI Integration

The Attorney Operations panel now shows:

- overall readiness percentage
- lane readiness percentages
- lodgement readiness
- registration readiness
- at-risk / ready-for-lodgement badge
- top next action
- active blockers
- manual blocker creation
- manual blocker resolution

This is layered into the existing attorney workflow panel and keeps all previous lane/document/update actions intact.

## Client Visibility Safety

Client-safe blocker messaging is represented as metadata on blockers, but the UI and service default manual blockers to internal visibility.

Client-visible blockers require explicit visibility selection and permission checks. Internal blockers and attorney management commentary are not exposed to clients by default.

## Migration Notes

The local migration adds:

- `attorney_workflow_blockers`
- blocker RLS policies
- blocker indexes
- event types for blocker/readiness activity

Event types added include:

- `AttorneyManualBlockerAdded`
- `AttorneyManualBlockerResolved`
- `AttorneyManualBlockerReopened`
- `AttorneyCriticalBlockerCreated`
- `AttorneyMatterMarkedAtRisk`
- `AttorneyReadyForLodgement`
- `AttorneyReadinessRecalculated`

This migration is local and has not been applied to the linked Supabase project.

## QA Fixtures

Added `scripts/verify-attorney-readiness.mjs`.

Covered scenarios:

- cash deal excludes bond lane
- missing transfer attorney creates assignment blocker
- missing bond attorney creates bond assignment blocker
- missing buyer FICA creates document blocker
- manual critical blocker flags matter at risk
- ready transfer lane produces ready-for-lodgement state

## Verification Results

`node scripts/verify-attorney-readiness.mjs`

Result: passed.

Targeted lint:

`npx eslint src/services/attorneyWorkflow/attorneyReadinessEngine.js src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx scripts/verify-attorney-readiness.mjs`

Result: passed.

`npm run build`

Result: passed.

Known build warnings:

- Existing Vite CSS minify warning around generated CSS `-: TZ.;`
- Large bundle chunk warning
- Vite dynamic/static import warnings for modules used by `attorneyReadinessEngine.js`; these do not fail the build

`npm run lint`

Result: failed due to existing repo-wide lint debt.

Known existing lint shape:

- 126 problems
- 95 errors
- 31 warnings
- existing unused variables, React hook/compiler issues, unresolved names in `src/lib/api.js`, and temporary spec globals

No targeted Phase 8 lint errors were found.

## Phase 9 Readiness

Phase 8 gives future dashboard and reporting work a reusable intelligence model:

- matter risk
- blocker reasons
- next legal action
- lodgement readiness
- registration readiness
- ready/near-ready matter queues
- management summary metrics

