# Attorney Workflow Phase 8 Exceptional Legal Scenarios

Date: 2026-07-12

## Goal

Build explicit attorney handling for manual-review and unsupported legal scenarios so exceptional matters do not silently continue, disappear into generic blockers, or get stuck without operational ownership.

## Implemented

- Added the legal support-boundary resolver to the attorney transaction detail page.
- Added a Legal Exception Review model for supported, manual-review, and unsupported boundary states.
- Added an attorney overview panel that shows either paused automation for manual review or stopped automation for unsupported scenarios.
- Added visible operational ownership for the assigned conveyancer or conveyancer / firm principal.
- Added direct actions to manage the owner, review boundary documents, and draft an internal legal exception review note.
- Reused the legal support-boundary gate so manual-review and unsupported classifications remain covered by source legal fixtures.

## Verification

```bash
npm run test:attorney-workflow-phase8-exceptional-legal-scenarios
npm run verify:attorney-workflow-phase8-exceptional-legal-scenarios
```

The full Phase 8 verification command runs:

- Attorney workflow Phase 7 actionable blocker gate.
- Legal support-boundary regression gate.
- Existing attorney Phase 8 close-loop verifier.

## Phase 8 Acceptance

- [x] Manual-review legal scenarios show a visible pause policy in the attorney overview.
- [x] Unsupported legal scenarios show a visible stop policy in the attorney overview.
- [x] Operational ownership is visible and can be assigned or managed.
- [x] Boundary documents can be opened directly from the exception panel.
- [x] Internal legal exception review notes can be drafted from the exception panel.
- [x] B-ATTY-0-7 is closed in the Phase 0 contract.
- [x] Verification command exists: `npm run verify:attorney-workflow-phase8-exceptional-legal-scenarios`.

## Deferred

- Strict live multi-firm evidence remains pending from Phase 4 until staging fixture values are supplied.
- Phase 9 pilot monitoring is implemented in `docs/audits/attorney-workflow-phase9-pilot-monitoring.md`.

Decision: GO TO PHASE 9 WITH EXCEPTIONAL LEGAL SCENARIOS OWNED.
