# Conveyancer Signing — Phase D3

## Purpose

D3 provides the legal workflow contract for a signing appointment. It coordinates a ready D2 signing plan with a future session, exact attendees, selected signing methods, legal capacity at the appointment date, availability, RSVP, confirmation, rescheduling, attendance and completion evidence.

The executable workflow is `src/services/attorneyWorkflow/conveyancerSigningAppointmentWorkflow.js`.

## Relationship to existing scheduling

The platform already contains generic transfer and bond signing templates, calendar invite generation, availability checks, reminders and rescheduling services. D3 does not replace them. It supplies the legally governed appointment state that those integrations can consume later.

## D2 and D1 controls

An appointment can be proposed only from a structurally valid and legally approved D2 plan. D3 binds the exact signing-plan revision and fingerprint, source document, matter, transaction, organisation, lane, and document fingerprints.

Each attendee comes from the selected D2 signing order group. D3 checks the attendee's D1 capacity against the scheduled date when the appointment is proposed, when it is rescheduled, and immediately before confirmation. Revoked, conflicting or expired capacity fails closed.

## Session modes and signing methods

D3 supports:

- in-person sessions;
- remotely supervised electronic sessions; and
- hybrid sessions.

The selected method must be permitted by D2. Wet-ink signing is prohibited in a remote-only session. Physical and remote locations are represented by opaque references or hashes rather than addresses or meeting links.

## Availability and readiness

The workflow detects overlapping boardroom/resource reservations and overlapping signer appointments. It supports generic active appointment statuses so it can be integrated with the current scheduling store.

Required signers must accept before confirmation. A tentative or pending RSVP keeps the appointment awaiting responses. A decline blocks readiness and moves the workflow to coordinated rescheduling. Optional witness, commissioner and interpreter requirements are explicit.

## Controlled lifecycle

The appointment lifecycle covers:

- proposal;
- RSVP capture;
- reschedule requests;
- controlled rescheduling;
- confirmation;
- attendance or no-show recording;
- legal completion; and
- reasoned cancellation.

Commands use appointment ID, revision and fingerprint preconditions to reject stale tabs. Exact command and proposal replays are idempotent, while reused IDs with changed payloads are rejected.

Secretaries may coordinate, confirm, reschedule, cancel and record attendance. Final completion requires a legal user authorised for the transfer, bond or cancellation lane.

## Completion boundary

Appointment completion proves that the governed session occurred and records attendance. It does not prove that a valid signature was captured. Signature evidence remains the responsibility of C7, so every D3 outcome and audit event explicitly records `signatureEvidenceRecorded: false`.

## Reminder projection and privacy

D3 can project 24-hour, two-hour and due-time reminder instructions. It does not send them. Audit events contain stable IDs, status, revisions and fingerprints but exclude RSVP references, names, emails, identity numbers, addresses and meeting URLs.

## Phase boundary

D3 is an in-memory workflow. It does not create calendar events, reserve rooms, persist appointments, send notifications, capture signatures, update C7, or write attendance to the database. No database migration is required.
