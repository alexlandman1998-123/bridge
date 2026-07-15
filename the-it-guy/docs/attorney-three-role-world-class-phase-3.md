# Attorney three-role world-class programme — Phase 3

Phase 3 gives the transfer attorney a role-specific command centre on the existing matter workspace.

## Delivered

- A deterministic transfer cockpit model covering instruction, FICA/entity authority, duty and clearances, drafting/signing, linked-attorney dependencies, lodgement, registration, and close-out.
- A primary next-action surface backed by the existing executable workflow commands.
- Readiness metrics for missing data, documents, signatures, and cross-lane dependencies.
- Bond and cancellation handoffs are visible as coordination signals. They remain read-only source data; transfer users may request or escalate a handoff from their own lane but cannot mutate the other attorney's workflow.
- Lane permissions control whether the primary transfer action is executable or shown as read-only.

## Exit evidence

Run `npm run test:attorney-three-role-phase3`. The suite includes the Phase 0–2 regression chain, transfer cockpit model tests, UI wiring checks, and the existing workflow usability command verification.
