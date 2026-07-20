# Attorney Transaction Workflow Phase 5 Notes

## Scope Completed

Phase 5 hardens attorney workflow lanes with a reusable permission matrix, service-level checks, UI action gating, visibility filtering, client safety defaults, and audit events for denied access attempts.

Implemented:

- attorney permission matrix constants
- reusable attorney legal permission service
- service-layer enforcement for lane viewing, stage updates, notes, document requests, and signing controls
- per-lane UI permission gates
- client-visible update permission checks
- client portal visibility normalization for attorney update scopes
- stricter RLS policy draft for lane history and lane updates
- unauthorized legal workspace access audit events

## Permission Matrix

Added:

- `the-it-guy/src/constants/attorneyPermissions.js`

The matrix separates:

- transaction-level roles: `transfer_attorney`, `bond_attorney`, `cancellation_attorney`
- firm management roles: `firm_admin`, `director_partner`, `attorney_admin`, `attorney_manager`
- visibility scopes: `internal`, `professional_shared`, `client_visible`

Default lane behavior:

- primary transfer attorneys can operate transfer, bond, and cancellation lanes as the transaction legal process controller
- bond attorneys can operate bond lanes only
- cancellation attorneys can operate cancellation lanes only
- managers/admins can oversee firm matters and assign/reassign where existing permissions allow
- management lane editing still requires assignment unless management override is enabled by firm policy

The transfer attorney controller rule does not merge the roles. Bond and cancellation attorneys remain separate role assignments and workflow views, but the primary transfer attorney can drive those lanes when coordinating registration readiness.

## Permission Service

Added:

- `the-it-guy/src/services/permissions/attorneyPermissionService.js`

Key helpers:

- `canViewTransactionLegalWorkspace`
- `canViewAttorneyLane`
- `canUpdateAttorneyLanePermission`
- `canRequestAttorneyDocuments`
- `canUploadAttorneyDocuments`
- `canReviewAttorneyDocuments`
- `canManageAttorneySigning`
- `canAddAttorneyInternalNote`
- `canAddAttorneySharedUpdate`
- `canPublishClientVisibleLegalUpdate`
- `canAssignAttorneyToTransaction`
- `canReassignAttorney`
- `canViewFirmAttorneyMatters`

The service considers:

- current user profile role
- firm membership
- attorney firm role
- transaction attorney assignment
- lane role
- assignment status
- transaction participant access for professional read-only users
- legacy professional assignment email fields where present

## Service-Layer Enforcement

Updated:

- `the-it-guy/src/services/attorneyWorkflow/attorneyWorkflowLaneService.js`

Protected actions:

- legal workspace lane read
- lane stage update
- internal attorney note
- shared professional update
- client-visible legal update
- lane document request

The service now returns per-lane permission flags so the UI does not guess.

## Visibility Rules

Attorney update visibility is now filtered before the lane panel receives updates:

- `internal`: attorney firm users and permitted internal legal users only
- `professional_shared`: professional parties only
- `client_visible`: safe for client portal and professional users

Client-visible legal updates require explicit permission.

## Client Portal Safety

Updated:

- `the-it-guy/src/services/clientPortalActivityFeedService.js`

The client portal visibility normalizer now treats:

- `internal` and `internal_note` as `internal_only`
- `professional_shared` and `shared_professional_update` as `shared_role_players`
- only `client_visible` remains client-visible

Lane document requests are marked `client_visible` only when requested from `client`, `buyer`, or `seller`.

## UI Gating

Updated:

- `the-it-guy/src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx`

Actions now render from returned lane permissions:

- Update Stage requires `canUpdateStage`
- Add Update requires one of note/shared/client-visible permissions
- Request Document requires `canRequestDocuments`
- Open Signing Packets requires `canManageSigning`
- read-only users see legal progress only

## RLS / Policy Draft

Updated local migration:

- `supabase/migrations/202605150003_attorney_workflow_lanes.sql`

The temporary demo-all policies for `transaction_attorney_lane_history` and `transaction_attorney_lane_updates` were replaced with policies scoped to:

- assigned attorney users
- attorney firm managers/admins
- transaction participants for professional/client-visible scopes
- transaction owner/org admins

This migration is prepared locally and has not been applied remotely in this pass.

## Audit Logging

Added event support:

- `AttorneyLaneClientVisibleUpdatePublished`
- `AttorneyUnauthorizedAccessAttempt`

Unauthorized legal workspace permission resolution/view attempts are logged best-effort without exposing raw backend details to the user.

## QA Fixtures

Reused:

- `scripts/verify-attorney-workflow-lanes.mjs`

Result:

- attorney workflow lane verification passed.

## Build / Lint

Targeted lint:

- `npx eslint src/constants/attorneyPermissions.js src/services/permissions/attorneyPermissionService.js src/services/attorneyWorkflow/attorneyWorkflowLaneService.js src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx src/services/clientPortalActivityFeedService.js` passed with no errors.

Build:

- `npm run build` passed.
- Existing Vite warnings remain: one CSS minify syntax warning from generated CSS and large bundle chunk warnings.

Full lint:

- `npm run lint` still fails on existing repo-wide lint debt: 95 errors and 31 warnings.
- The failures remain in pre-existing areas such as `src/lib/api.js`, `src/pages/ClientPortal.jsx`, `src/pages/DevelopmentDetail.jsx`, `src/components/SubprocessWorkflowPanel.jsx`, and temporary spec files.

## Known Boundaries

This phase does not add advanced analytics, readiness scoring, automated messaging, or export/reporting controls.

The RLS policy draft depends on the existing transaction participant and attorney assignment columns being present in the target database.
