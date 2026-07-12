# Attorney Workflow Phase 5 Signing Appointments

Implemented on 2026-07-12.

## Goal

Replace the Phase 1 note-based signing shortcut with a real appointment workflow. Scheduling signing must now create an appointment linked to the transaction, workflow lane, participant, visibility, reminders, and matter activity.

## Implemented

| Area | Phase 5 behavior |
| --- | --- |
| Transaction quick action | `Schedule Signing` opens a signing appointment form instead of a workflow note draft. |
| Appointment records | Submission calls `createAttorneyAppointmentInvite`, which writes to `appointments`. |
| Participants | The selected buyer, seller, agent, or roleplayer is written through `appointment_participants`; the attorney is added as the accepted internal participant. |
| Workflow link | Transfer signing maps to `transfer_workflow` / `transfer_document_signing`; bond signing maps to `bond_workflow` / `bond_document_signing`. |
| Queue intent | Attorney Matters `schedule_appointment` route state opens the same appointment workflow directly on transaction detail. |
| Activity | Successful appointment creation records linked matter activity with `relatedEntityType: appointment`. |
| Refresh | The transaction workspace reloads after appointment creation so the appointment dashboard can show the new row. |

## Verification

```bash
npm run test:attorney-workflow-phase5-signing-appointments
npm run verify:attorney-workflow-phase5-signing-appointments
```

## Current Result

Local implementation is complete. Phase 5 verification runs the Phase 4 local multi-firm smoke contract as its prerequisite, then proves the signing appointment workflow is wired.

## Phase 5 Acceptance

- [x] `Schedule Signing` no longer writes a placeholder note.
- [x] Transaction detail exposes a signing appointment form.
- [x] Transfer and bond signing appointment types are selectable.
- [x] Buyer/seller/roleplayer recipient selection can prefill from loaded transaction data.
- [x] Manual recipient entry is available when transaction contact data is incomplete.
- [x] Appointment creation writes through the existing appointment service.
- [x] Appointment participants, reminders, notifications, and matter activity are tied to the appointment path.
- [x] Queue `schedule_appointment` opens the appointment workflow directly.
- [x] Verification command exists: `npm run verify:attorney-workflow-phase5-signing-appointments`.

## Deferred

- Phase 6 person-level requirement UI is implemented in `docs/audits/attorney-workflow-phase6-person-level-requirements.md`.
- Exceptional manual-review operational ownership remains Phase 8.
- Strict live multi-firm evidence remains pending from Phase 4 until staging fixture values are supplied.

Decision: GO TO PHASE 6 WITH SIGNING APPOINTMENTS WIRED.
