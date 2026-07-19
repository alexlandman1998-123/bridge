# Attorney calendar Phase 7 staging acceptance

## Automated gate

Run `npm run certify:attorney-calendar:staging` against staging. The certification uses the demo attorney, an assigned QA matter, four disposable appointments, `.invalid` recipient addresses, and exact cleanup. It does not send external email.

The automated result must confirm:

- authenticated attorney access and assigned-matter scope;
- cross-organisation and anonymous access rejection;
- transfer signing, bond signing, attorney consultation, and internal meeting persistence;
- participant, notification-event, and reminder audit records;
- public RSVP acceptance;
- client reschedule request and attorney resolution;
- calendar-sync invalidation after a time change; and
- Cleanup verification with zero remaining fixture appointments.

## Controlled recipient delivery

A real delivery test requires a Controlled recipient owned by the release team. Set `ATTORNEY_CALENDAR_TEST_RECIPIENT` only for a supervised acceptance session. Do not use a client or production attorney address.

Record the provider message ID, notification-event state, attachment filename, stable UID, organizer, attendee, Johannesburg start/end conversion, RSVP URL, and delivery timestamp.

## Calendar client matrix

Import the same received `.ics` attachment into each client without editing it:

| Client | Required evidence |
| --- | --- |
| Google Calendar | Correct start/end, timezone, organizer, attendee, location/link, and UID |
| Microsoft Outlook | Correct start/end, timezone, organizer, attendee, location/link, and update/cancel behavior |
| Apple Calendar | Correct start/end, timezone, organizer, attendee, location/link, and update/cancel behavior |

## Browser and role acceptance

- Sign in as firm admin, director/partner, transfer attorney, bond attorney, and reception/scheduling where controlled accounts exist.
- Confirm the Calendar route renders and Create Invite opens.
- Confirm an unauthorized attorney cannot read or create against another firm's matter.
- Exercise desktop, mobile viewport, and keyboard-only operation.
- Inspect console, network failures, function logs, and notification-event records.

## Release decision

Phase 7 is fully accepted only when the automated certification passes and the controlled delivery, Google Calendar, Microsoft Outlook, Apple Calendar, browser, and role evidence is signed by the release owner. Any failed row blocks Phase 8 rollout.
