# Bond attorney module - Phase 1 usability pass

Phase 1 makes the existing bond-attorney lane easier to operate without adding legal-document generation, bank integrations, migrations or new persistence paths.

The executable source is `src/core/transactions/bondAttorneyModulePhase1.js`. The UI integration is in `src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx`.

## What changed

- The bulk document action now says `Create Document Requests`.
- The action description states that requests are created, not legal documents.
- Document requirements are no longer capped at eight rows.
- Requirements are grouped by category.
- Each requirement shows owner, status, next action and why it is needed.
- Each requirement gets a Request / Upload / Review / Generate / Sign action map.
- Attorney-controlled requirements show generation as manual or later unless a governed generator exists.
- The page now shows a role-focused cue for the user's active lane.
- Each lane shows a primary next step.
- Blockers include an `Open lane` jump link.

## Phase 1 boundary

This phase intentionally does not:

- Generate mortgage bonds, powers of attorney, resolutions or bank mandates.
- Pretend bank instructions, approval-to-lodge notices or Deeds outcomes can be synthesized.
- Add a Bond Pack Workspace.
- Add bank-condition persistence.
- Change signature legality or wet-ink/original handling.

Those stay in later phases.

## Acceptance check

Run:

```bash
npm run test:bond-attorney-module-phase1
```

Phase 1 is complete when the Phase 0 baseline still passes, the Phase 1 usability contract passes, and the attorney workflow panel no longer contains the old `Generate Missing Requests` wording or the old document-requirement eight-row cap.
