# Bond Application Prefill Phase 10: Buyer Task Workspace Redesign

## Purpose

Phase 10 implements the first live UX redesign from the Phase 9 audit.

The buyer no longer lands directly in a dense section form after OTP unlock. The unlocked application now starts with a guided task workspace that explains progress, blockers, the next best action, and the full application path before the detailed legacy fields.

## Runtime Contract

`buildBondApplicationUxWorkspaceModel()` creates the Phase 10 workspace model.

It exposes:

- `version: phase-10-v1`
- `layout: task_workspace`
- `summaryCards`
- `sectionCards`
- `nextAction`
- `blockerSections`
- `documentBlockers`
- `confirmedCount`
- `readyToConfirmCount`
- `blockerCount`

The model is pure and consumes existing buyer application state:

- section status
- confirmed section keys
- active confirmation cards
- missing confirmation-card field
- required documents
- progress percent
- dirty/saving/submitted state

## Buyer Portal UI

`ClientPortal.jsx` renders the workspace above the detailed application fields with these markers:

- `data-bond-ux-task-workspace="phase-10"`
- `data-bond-ux-next-action-bar="true"`
- `data-bond-ux-section-stepper="true"`

The workspace includes:

- guided application path heading
- progress with blockers
- confirmed, ready-to-confirm, and blocker summary cards
- one primary next action
- a mobile-friendly section stepper
- document blocker chip

## What Changed

Phase 10 addresses the highest-risk Phase 9 UX gaps:

- The buyer sees a task workspace before the detailed field grids.
- The next action is explicit: confirm section, complete missing field, upload document, save progress, continue, or submit.
- Section navigation is presented as a single guided stepper before the legacy detail sidebar.
- Documents become visible as application blockers instead of only a separate tab.
- Phase 7 confirmation metadata and Phase 8 originator confidence remain untouched.

## Boundary

Phase 10 does not remove the legacy detailed fields. The detailed section forms remain in place for data compatibility while the new workspace becomes the buyer's first interaction layer.

Phase 11 can now use this workspace to close remaining prefill coverage and add richer guided cards for employment, income, banking, assets, credit, documents, and declarations.
