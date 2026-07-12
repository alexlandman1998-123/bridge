# Attorney Workflow Phase 7 Actionable Blockers

Date: 2026-07-12

## Goal

Make every visible attorney blocker actionable from the page where it appears, so an attorney does not have to infer the next workspace, modal, or workflow lane manually.

## Implemented

- Added a reusable actionable-blocker resolver in `AttorneyTransactionDetail.jsx`.
- Added shared `ActionableBlockerButton` and `ActionableBlockerRows` UI primitives.
- Wired the Attorney Unblocker Board so visible facts, documents, signing items, blockers, and hidden-count summaries have local actions.
- Wired workflow hub blocker messages to open the relevant lane or roleplayer/finance/document workflow based on blocker text.
- Added a direct action from the Document Readiness blocker card to the missing-document list.
- Added a Roleplayer Blocker Actions section for missing assignments, missing roleplayer emails, stale buyer intros, and stale team handoffs.
- Added action buttons beside registration validation blockers, including an explicit recheck control.
- Preserved existing Phase 7 triage-action coverage for document corrections and signing follow-ups.

## Verification

```bash
npm run test:attorney-workflow-phase7-actionable-blockers
npm run verify:attorney-workflow-phase7-actionable-blockers
```

The full Phase 7 verification command runs:

- Attorney workflow Phase 6 person-level requirement gate.
- Existing attorney Phase 7 triage action verifier.

## Phase 7 Acceptance

- [x] Visible workflow blockers have a CTA beside the blocker text.
- [x] Visible document blockers can open the document workspace or missing-document list.
- [x] Visible signing blockers can open the signing appointment workflow.
- [x] Visible roleplayer blockers can open assignment, intro, or handoff actions.
- [x] Visible registration blockers can open guided registration and recheck requirements.
- [x] Verification command exists: `npm run verify:attorney-workflow-phase7-actionable-blockers`.

## Deferred

- Phase 8 exceptional legal scenario ownership is implemented in `docs/audits/attorney-workflow-phase8-exceptional-legal-scenarios.md`.
- Strict live multi-firm evidence remains pending from Phase 4 until staging fixture values are supplied.

Decision: GO TO PHASE 8 WITH BLOCKERS ACTIONABLE WHERE THEY APPEAR.
