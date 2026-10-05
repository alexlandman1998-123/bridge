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

## Buyer portal layout refinement — 3 October 2026

The shared workspace now presents Details, Documents, Review and Submission in
one progress display. `BondApplicationTaskWorkspace` retains the existing next
action and section-change callbacks. A single labelled section picker replaces
the eleven cards and duplicate sidebar. Missing document counts come from the
workspace's actual document blockers, even if the legacy section status says
ready. The percentage alone never marks submission complete.

The application opens immediately. Its compact introduction no longer repeats
Finance's offers/grant summary metrics. Existing Application, Offers and Grant
views remain accessible in a mobile-width tab row. Prefill provenance remains
available in an expandable panel; all existing fields, confirmation, save,
validation and upload handlers remain in use. Guided and legacy forms share
`BondApplicationStageProgress`; guided internal screens and navigation retain
the existing conditional flow.

Verified locally against the Only Realty demo on desktop and a 433px mobile
viewport: no page-width overflow or console errors, and document section
navigation reaches the existing upload controls. Presentation regression tests
cover section navigation, disabled actions, document blockers and completion
state independent of percentage. This is a local layout change; standalone
service parity and release remain separate phases.

The subsequent runtime wiring now uses `ConnectedBuyerBondApplication` for the
supported single-applicant routes. Document refreshes preserve in-flight edits;
revision checks and queued saves protect the shared draft. Signed answers become
read-only, while the same document checklist remains available for later uploads.
The scope and local verification evidence are recorded in
`docs/bond-application-portal-phase0-boundary-audit.md`. The runtime migration
must be released before deploying these frontend changes.

## Guided application cleanup — 3 October 2026, evening

Supported buyer routes now open the guided application directly, without the
stacked introduction, task summary, Application/Offers/Grant tab row, duplicate
summary rail, or detailed legacy form below it. Quotes remain available in
Finance. Explicit route overrides and the existing joint/surety participant
handoff are preserved. This supersedes the tab-row layout described above.

One header contains the four application stages. The active section uses a
bounded reading width and a single Back/Continue footer. Purchase/property
context appears once; prefilled amounts remain editable. Required-answer counts
are deduplicated by answer path. Failed saves display the existing retry message
and do not advance or exit the application. Demo navigation saves only for the
current session and does not call the remote draft API.

Checked at 1440px desktop and 390px mobile: no page-width overflow, no console
errors, navigation advances and missing required choices prevent advancement.
Presentation/runtime tests cover editable values, save-before-navigation, save
failure, one active section and unique required-answer counts (9 tests passed).
Existing guided-flow phase 2, 3 and 5 checks passed. The app verification suite
passed with zero lint errors, existing warnings, baseline tests and a successful
build. No production deployment, database migration, signing or bank submission
was performed; the pending runtime migration still precedes a frontend release.
