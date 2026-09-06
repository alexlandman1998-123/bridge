# Attorney release readiness — Phase 4 UI hardening

## Objective

Make the attorney workflow clear and recoverable on desktop and mobile, including for keyboard users.

## Delivered

- Shared dialogs now trap focus, close with Escape, restore the previous focus target, expose their visible title and supporting copy, and prevent background scrolling.
- Disabled completion actions now show a visible plain-language explanation linked to the disabled control. Completion guidance no longer depends on hover-only tooltips.
- Attorney work areas announce saving state, autofocus the first required status field, and prevent dismissal while a status update is being written.
- Each lane mutation clears stale success feedback before it starts. Errors remain announced and failed form drafts stay open for correction or retry.
- Existing responsive workbench layouts and touch-friendly control heights are protected by the Phase 4 gate.

## Automated gate

Run `npm run test:attorney-release-phase4`. This is cumulative through Phase 3 and then verifies the Phase 4 accessibility, feedback, draft-recovery, touch-target, and responsive source contracts.

The production build remains the authoritative compile gate. Final release sign-off still requires the Phase 0 named actors to run the desktop and mobile walkthrough against staging.
