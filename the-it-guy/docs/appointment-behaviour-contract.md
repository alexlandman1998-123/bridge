# Appointment behaviour and acceptance rules

The Arch9 transaction workspace must save one appointment that remains consistent in the calendar, agent profile, dashboard, related lead or property, transaction workspace, and mobile view. Its time, ownership, participants, responses, and notification preferences belong to that same record. Each screen applies the same access and lifecycle rules.

Phase 1 establishes these rules and the reproducible failure baseline. Phase 2 implements date, duration, timezone and status corrections. Phase 3 implements atomic reservations, participant identities, responses and replacement approvals in the local source. The application does not yet enforce every rule below: Phase 4 implements internal calendar/profile/dashboard reconciliation locally; Phase 5 implements ordinary appointment delivery preferences, atomic jobs, worker retries and receipts locally; Phase 6 implements explicit agent scheduling, reversible archive and ordinary agent/mobile actions locally; Phase 7 implements reviewed historical reconciliation and guarded recovery locally. The [calendar audit](calendar-module-audit-2026-10-08.md) records the original faults and the production snapshot separately.

The requester confirmed on 8 October 2026 that an unanswered appointment reserves its slot for **24 hours**, ending earlier if the appointment starts. Other defaults below carry forward the proposed repair approach and existing type templates. Future changes to these defaults must update the rules and their acceptance scenarios together.

## Appointment identity and ownership

An appointment has one stable ID, organisation, responsible scheduling agent or professional, creator, timezone, start and end, lifecycle status, revision, participants, and optional business-record links. The creator records who performed the action; creating for another agent does not make the creator the responsible agent. An appointment's selected type and owner cannot be overridden by an unrelated lead left open in the interface.

Participant IDs identify attendance records. User IDs identify authenticated profiles; contact IDs identify external contacts. They are separate identities. Editing a person retains their attendance ID and response history. Removing them revokes their appointment access and supersedes their pending delivery. An external email attendee does not need an Arch9 account.

Appointment revisions advance when the saved schedule, venue, required participants, or cancellation changes. Saves and responses must identify the revision they apply to. An older response or save cannot silently overwrite a newer booking. Calendar exports keep one stable event UID and increase their sequence on material changes.

## Status and slot reservation

Participant responses are separate from the appointment lifecycle. One person's acceptance does not confirm everyone, and one person's decline does not silently cancel the booking for the others. Confirmation requires all required attendees to accept the current revision; optional attendees do not block it. The responsible agent can confirm a booking with no external confirmation requirement through an explicit action.

| Appointment status | Meaning | Reservation | Active work and delivery |
| --- | --- | --- | --- |
| `draft` | Incomplete booking, not issued | None | Draft list only; no invitations or reminders |
| `requested` | Issued and awaiting required confirmation | Initial 24 hour hold | Pending while the hold is valid; follow-up after expiry |
| `accepted` | Acceptance recorded, with confirmation still outstanding | Same initial hold | Same pending rule; a partial response does not reset the timer |
| `alternative_requested` | Someone requested another time | Keep a previously confirmed original slot; otherwise retain the initial hold | Show the original schedule and the unresolved request separately |
| `alternative_proposed` | A specific replacement time awaits approval | Original reservation as above; proposed slot has its own 24 hour hold | Clearly label the proposed time; do not represent it as confirmed |
| `confirmed` | Required confirmation is complete or an authorised confirmation was recorded | Firm reservation until the appointment ends or closes | Upcoming or in progress; use saved reminder preferences |
| `declined` | Responsible agent closed a request that will not proceed | None | History only; stop pending delivery |
| `completed` | Responsible agent recorded that the appointment happened | None | History and completion results only |
| `cancelled` | Booking withdrawn, with actor, time and reason | None | History only; cancel obsolete jobs and issue the cancellation if enabled |
| `no_show` | Responsible agent recorded non-attendance | None | History and follow-up results only |

The reservation deadline is the earlier of the request issue time plus 24 hours and the scheduled start. Issue time is a server timestamp persisted for the current request. Reloads, partial responses, ordinary edits, and delivery retries do not extend it. An explicit new request or proposal can establish a new deadline after availability is checked. A proposed replacement holds its own slot only until the earlier of its issue time plus 24 hours and its proposed start.

At expiry, release the pending reservation and stop its scheduled reminders. Preserve the request and responses, label it as needing follow-up, and exclude it from upcoming counts. Expiry is a reservation condition, not a fabricated completion, no-show, or cancellation. A late acceptance cannot restore the slot: the agent must check availability and issue a new request. When a replacement proposal expires or is rejected, retain the original confirmed booking and its valid reminders.

Past unresolved appointments appear in follow-up work, never as the next future appointment. Completed, declined, cancelled, no-show, archived, and draft records are excluded from upcoming counts even if their saved date is in the future. In-progress appointments can appear in today's schedule, separately from the next future appointment. All readers use the appointment timezone; the default workspace day is Africa/Johannesburg.

Canonical status keys must survive a save and reload unchanged. Recognised historical labels such as Pending Confirmation, Buyer Confirmed, Needs Reschedule, Alternative Proposed, and No Show map to their canonical status. Unrecognised values require review rather than silently creating a requested reservation.

## Allowed actions and their effects

Every action requires server-verified scope and permission. Cancellation, decline, completion, and no-show do not run a new availability reservation check. They must remain possible when the booking already overlaps another record.

| Action | Valid starting state | Required result |
| --- | --- | --- |
| Save draft | New or draft | Preserve unfinished details without reserving time or sending messages |
| Issue request | Draft, or an expired pending request explicitly reissued | Validate time and participants, reserve the slot, persist issue time and selected delivery jobs |
| Accept or decline attendance | Current, unexpired issued revision | Record only that participant's response; determine whether required confirmation is now complete |
| Confirm | Current valid request with required confirmation satisfied | Atomically promote the reservation; save the verified result |
| Edit schedule or required attendees | Active booking | Preserve identities; check the new reservation atomically; require confirmation of the changed revision |
| Propose another time | Active booking | Keep the original schedule and reservation; save the proposed schedule separately with its deadline |
| Approve replacement | Current valid proposal with required approvals | Atomically reserve the replacement and release the original; supersede original delivery jobs |
| Reject or expire replacement | Open proposal | Release only the proposal hold; restore the original booking's presentation and valid jobs |
| Cancel | Any active booking | Save cancellation history, release reservations, revoke responses and supersede pending jobs |
| Close as declined | Unconfirmed request | Preserve attendance responses and closure reason; release pending holds |
| Complete or mark no-show | Active appointment after its scheduled start | Record the actual outcome and required linked task effects; do not infer it automatically from age |
| Archive or restore | Draft or terminal booking | Hide or restore history visibility without reviving reservations, tokens or messages |

Changing a confirmed time follows the proposal flow: the existing time remains authoritative until the replacement is approved. Pending requests can be edited directly, but an explicit reissue is needed to renew an expired hold. Applying an approved replacement recalculates the authoritative start and end, then updates every reader and delivery job together. A stale competing approval must fail and refresh rather than reserve both alternatives.

Terminal bookings cannot be silently reopened or rescheduled. Create a new linked request when another appointment is needed. Permanent deletion is outside this repair contract; cancelled appointments and accidental drafts can be hidden through reversible archive. Failed optimistic actions must restore the last verified state and show a retry or recovery action.

## Access by role

| Person | Appointment visibility | Allowed work |
| --- | --- | --- |
| Responsible agent or scheduling professional | Their scoped bookings in calendar, profile, dashboard and linked work | Manage the booking and its outcomes |
| Creator scheduling for someone else | Bookings they created while their existing organisation permissions remain valid | Manage through authorised scheduling access; never change ownership implicitly |
| Principal or manager | Bookings within their existing authorised organisation or branch scope | Schedule for an agent, reassign explicitly and manage within that scope |
| Co-agent or internal attendee | Bookings they attend in their own calendar, profile and dashboard | Respond for themselves; edit the full booking only with separate management permission |
| Linked lead or listing owner | Related appointment information through the existing record access rules | View related work; management still requires appointment permission |
| Invited client or external attendee | Their permitted client-visible details through a current secure session or token | Accept, decline or propose another time for themselves |
| Unrelated person or organisation | No access | No reads, counts, participant details or changes |

Private attorney and internal-only bookings retain their existing firm and role boundaries. Linkage to a lead, property or transaction does not grant access to private notes or other attendees' confidential information. Names and email matches are not an authorisation boundary. Actual permissions remain enforced in the database and server, including negative tests for another organisation and another attendee.

## Consistency across screens

| Destination | Required appointment content and behaviour |
| --- | --- |
| Main calendar | Correct visible date range, owner and attendee scope; details and lifecycle actions |
| Agent profile and directory summary | Same scoped bookings and upcoming counts as that agent's calendar; include co-agent attendance |
| Dashboard | Earliest valid future appointment; separate follow-up work; open the exact booking |
| Lead and listing workspace | Correct related appointment history, status and outcome without overriding the selected owner |
| Transaction and professional workspace | Correct matter linkage and permitted appointment details; linked tasks match verified outcomes |
| Client portal and response link | Current permitted revision and personal response; a stale or revoked link explains the problem |
| Mobile | Same data and permissions; open details and perform the essential actions |
| Export or connected provider | Correct time, duration, UID, revision and cancellation semantics; state whether it is a manual copy or connected sync |

All consuming screens refresh after a successful mutation, when another authorised user changes a booking, and after focus or reconnection. A failed load retains the last verified data with a visible error and Retry. Unknown counts must not be presented as zero. The internal consistency contract does not depend on Google or Outlook integration.

## Time and availability

Save one authoritative UTC start and end derived from the chosen local date, time and named timezone. A change to any scheduling field recalculates both instants. Derived display fields must agree with them. The browser or worker timezone cannot alter the booking. All-day appointments use local date boundaries and an exclusive end date consistently in storage and export.

Reject invalid dates, nonexistent local times, and non-positive duration. Where another timezone has an ambiguous clock time, require an explicit resolved instant rather than guessing. Existing inconsistent records remain flagged for agent review before correction.

Conflict enforcement includes the responsible agent, required internal participants, required client identities and resources. Optional participants receive a warning for their conflicts. The database makes the final reservation decision, including simultaneous saves and bookings across organisations without revealing private details. Back-to-back appointments are allowed; existing type-specific travel buffers produce warnings. Evening and weekend property appointments remain possible.

## Invitations and reminders

Persist invitation and reminder choices independently. Preserve the existing type defaults unless a saved per-booking rule replaces them. For the standard viewing, the existing defaults are 24 hours, two hours, and at the start; the custom 30 minute rule must replace those defaults when chosen. Declined or removed attendees receive no subsequent reminders. Internal-only visibility prevents external delivery.

Create only reminder times that remain in the future. A booking issued inside the two hour window can send its enabled invitation immediately and schedule only remaining future reminder offsets. Do not replay missed reminders or create a burst of catch-up messages. An expired pending hold suppresses its reminder jobs until a new valid request exists.

Persist jobs with the appointment revision before acknowledging that messages are queued. A browser closing cannot stop delivery. A worker checks the current revision, reservation, participant and preferences before sending, claims work safely, retries temporary failures and deduplicates receipts. Schedule changes, closure and participant removal supersede obsolete work. A reminder to an internal user uses a profile identity; an external attendee uses their contact or email route without an invented profile ID.

Distinguish queued, processing, provider accepted, delivered where confirmed by the provider, failed, and superseded. A marker or an empty job result is not evidence of delivery. Foreign key and permission errors must surface. A live controlled-recipient check is required before claiming invitation or reminder delivery works in production.

## Acceptance scenarios

The table carries forward all 42 audit scenarios. “Baseline” refers to executable local reproduction in `appointmentBehaviorBaseline.test.js`. “Existing” means a focused fixture check exists, not that the whole customer journey or production result is certified. Other rows identify the explicit check to add in the repair phase.

| Case | Scenario and required result | Evidence or remaining check | Repair phase |
| --- | --- | --- | --- |
| A01 | Standalone booking lets the agent choose type, owner and optional linkage | F15; create form and save journey | 6 |
| A02 | Buyer-lead booking retains the correct client and property links | Existing lead history; complete save receipt check | 3 and 6 |
| A03 | Seller valuation or presentation has the correct type and completion effect | Existing source checks need stale assertion review | 3 and 6 |
| A04 | A principal's chosen agent remains responsible | F15; creator versus owner fixture | 6 |
| A05 | Co-agent attendance appears in calendar, profile and dashboard | Baseline F11; dashboard control passes | 4 |
| A06 | Linked lead owner sees the permitted appointment assigned elsewhere | Existing lead reader; retain private-field boundary | 4 |
| A07 | Far-future navigation loads the visible range | Existing appointment range check | 4 |
| A08 | Dates near SAST midnight group on the correct day | Existing dashboard and mobile; extend all readers | 2 and 4 |
| A09 | UTC computer saves the same intended SAST time and duration | Baseline F02 in two process timezones | 2 |
| A10 | Rescheduling moves every derived time and downstream effect | Baseline F01; add end-to-end delivery revision check | 2 and 5 |
| A11 | Editing duration changes availability and exports consistently | Baseline F02; existing attorney duration checks | 2 |
| A12 | Simultaneous conflicting bookings produce one winner | F03; concurrent database transactions | 3 |
| A13 | Pending requests hold the slot for 24 hours and then release it | Baseline F03 for live holds; add expiry, partial response and late acceptance checks | 3 and 5 |
| A14 | Required client or second-agent conflicts block a duplicate | Baseline F04; extend client and atomic database cases | 3 |
| A15 | Back-to-back bookings show a travel warning without an arbitrary rejection | Existing engine buffer behaviour; UI warning check | 3 and 6 |
| A16 | Evening and weekend property appointments remain available | Existing engine behaviour; creation journey check | 2 and 6 |
| A17 | Room clashes respect resource organisation and atomic protection | Existing attorney fixtures; general-path coverage | 3 |
| A18 | Cancellation succeeds despite an existing overlap | Baseline F05 | 2 |
| A19 | Cancellation suppresses reminders and obsolete invitations | F08 and F18; queued-job and claimed-job checks | 5 |
| A20 | Accidental or cancelled duplicates can be archived and restored safely | F16; archive permission and history checks | 6 |
| A21 | Completion and its required linked task succeed together | F21; rollback and receipt checks | 3 |
| A22 | No-show survives save and is absent from upcoming work | Baseline F06; all-reader check | 2 and 4 |
| A23 | Client acceptance and decline validate identity and current revision | Existing response database checks; general-path parity | 3 and 6 |
| A24 | A proposed replacement preserves the original reservation until approval | Baseline F06; existing attorney coordination; proposal expiry check | 2 and 3 |
| A25 | Repeated, expired and revoked responses are idempotent or rejected clearly | Existing response fixtures; include expired hold | 3 and 6 |
| A26 | Attendee edits preserve identity and response history | F10; stable-ID update and rollback checks | 3 |
| A27 | Removing a participant revokes access and stops delivery | F10 and F18; token and job checks | 3 and 5 |
| A28 | Closing the browser immediately after save cannot stop queued delivery | F09; save receipt and server worker journey | 5 |
| A29 | Automatic reminders have valid recipients, claims, retries and receipts | Baseline F07; F08 worker and F20 rollout checks | 5 |
| A30 | Custom 30 minute preference replaces default reminders | Baseline F18; persisted preference check | 5 |
| A31 | Short-notice bookings do not replay expired reminder offsets | Future-offset and no-burst checks | 5 |
| A32 | Invitations off and reminders on remain independent after reload | F18; persisted preference and queue checks | 5 |
| A33 | Client without login receives their permitted email | Baseline F07 internal identity; external-email and schema check | 5 |
| A34 | Provider outage retries without false sent status or duplicates | Existing partial retry fixtures; general worker check | 5 |
| A35 | Other-device changes refresh open profile and dashboard views | F13; secure subscription or bounded refresh journey | 4 |
| A36 | Loading failure shows Retry and retains verified data | F12; reader and component failure fixtures | 4 |
| A37 | Old unanswered request appears in follow-up, not next appointment | Baseline F14; expiry and overdue view check | 4 |
| A38 | Completed future record is absent from upcoming counts | Baseline F14; all-reader status matrix | 4 |
| A39 | Manual calendar export has correct timezone, duration and revision | Existing export fixtures; F19 general-path parity and all-day check | 2 and 5 |
| A40 | Connected Google or Outlook changes propagate without duplicates | F17; separate integration decision and provider acceptance | 8 |
| A41 | Mobile supports details, creation, editing, cancellation and response | Existing reader fixtures; action and reconnect journey | 6 |
| A42 | Wrong user, attendee or organisation cannot read or change private bookings | Local RLS and response checks; full negative role matrix | 3 and 9 |

## Reproducible baseline and promotion to regression tests

Run from `the-it-guy/`:

```sh
TZ=UTC npx vitest run src/core/appointments/__tests__/appointmentBehaviorBaseline.test.js --maxWorkers=1
TZ=Africa/Johannesburg npx vitest run src/core/appointments/__tests__/appointmentBehaviorBaseline.test.js --maxWorkers=1
```

The suite exercises public application functions with fixture storage and a fake database client. All **21 complaint baseline scenarios are now ordinary passing regressions**. Phase 2 repaired time/status cases; Phase 3 repaired reservation and attendee cases; Phase 4 repaired profile/dashboard cases; Phase 5 repaired reminder identity, surfaced failures and persisted rule overrides. No expected-failure cases remain. The original Phase 1 snapshot (18 failures under UTC and 16 under SAST) and intermediate phase counts below remain dated evidence.

The complaint baseline stubs database and delivery entry points and requires that no Edge Function is invoked. Their local save path exercises the same appointment normalisation used by ordinary database saves. The participant precheck and reminder tests run the real service methods against fixture query responses. These checks do not certify hosted RLS, concurrent database writes, background deployment, or email delivery.

Use the existing attorney suite for its passing management, response and durable-delivery fixtures:

```sh
npx vitest run --config vitest.attorney-calendar.config.js
```

F08, F09, F10, F12, F13, F15, F16, F17, F19, F20 and F21 also need the database, component, browser, worker or controlled-provider checks identified above; a function-level baseline cannot certify those paths. The production snapshot remains dated evidence. Historical dates, overlap intent and past appointment outcomes require review in phase 7 rather than speculative correction.

## Phase 2 implementation and verification

The primary transaction workspace now uses one timezone-aware schedule conversion for ordinary saves, edits, conflict checks, suggested slots and manual calendar exports. Date or clock edits replace inherited timestamps; timestamp-only edits derive the local display fields; duration edits persist the end instant. Impossible dates, unknown timezones, non-positive durations, conflicting timestamps and reversed end times fail before the appointment write. Timed bookings use the selected day; an overnight timed-booking interface remains outside this change.

All-day bookings run from local midnight to the following local midnight, including 23 or 25 hour days when clocks change. Manual ICS and calendar links retain their exclusive all-day end. Timed exports use absolute UTC instants to preserve a chosen occurrence of a repeated clock hour, consistent with [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.3.5). A repeated local time requires an explicit offset-qualified timestamp; a nonexistent local time is rejected.

Canonical no-show and alternative-request/proposal statuses survive normalisation and reload. Cancellation, decline, completion and no-show bypass a new availability check. Completion and no-show require a started appointment, and closed bookings cannot be reopened or moved through ordinary updates. A status-only closure preserves an inconsistent historical start instead of guessing a correction. Active saves require review of contradictory scheduling fields.

The append-only migration [`20261008163445_appointment_end_instant.sql`](../../supabase/migrations/20261008163445_appointment_end_instant.sql) adds nullable `end_date_time`, a positive-end constraint and a calendar reader that wraps the existing permission checks. The lead reader carries the same end instant. Existing room/attorney checks use the selected timezone and saved end; older writers invalidate an inherited end if a schedule edit makes it stale. Historical rows receive no inferred backfill. **Apply this migration before releasing the updated application. It has only been exercised in a local PostgreSQL fixture; it has not been applied remotely.**

Run the focused checks from `the-it-guy/` under both process timezones:

```sh
TZ=UTC npx vitest run src/core/appointments/__tests__/appointmentBehaviorBaseline.test.js src/core/appointments/__tests__/appointmentTime.test.js src/lib/__tests__/appointmentSchedulingService.test.js src/lib/__tests__/leadAppointmentHistory.test.js src/hooks/__tests__/leadAppointmentHistoryReader.test.js --maxWorkers=1
TZ=Africa/Johannesburg npx vitest run src/core/appointments/__tests__/appointmentBehaviorBaseline.test.js src/core/appointments/__tests__/appointmentTime.test.js src/lib/__tests__/appointmentSchedulingService.test.js src/lib/__tests__/leadAppointmentHistory.test.js src/hooks/__tests__/leadAppointmentHistoryReader.test.js --maxWorkers=1
```

At Phase 2 handover, the focused suite contained 71 ordinary passing checks and the 11 known-failure cases. It covers asynchronous save, edit, reload and export, calendar/lead range and access boundaries through the actual reader migration, end constraints, old-writer compatibility, daylight-saving boundaries and terminal actions with overlapping bookings. The attorney suite also loads the new migration and checks room conflicts and legacy rescheduling. Primary-app lint, baseline and build are checked with the existing root `npm run check:app` command.

Phase 2 does not implement the agreed 24 hour holds, general atomic participant/reservation updates, the confirmed-time proposal lifecycle, profile/dashboard consistency, durable reminder preferences or workers, archive, historical repair, or connected Google/Outlook synchronisation. The F06 regressions verify status retention, not the complete proposal journey. Email attachment generation, delivery, cancellation of all obsolete queued work and live browser behaviour still need their assigned phase checks. No production records, deployment or test emails were changed for this implementation.

## Phase 3 implementation and verification

The primary workspace now saves an ordinary appointment, its current attendees, responses and reservation in one database transaction. A verified receipt is required before the client reports success. Scheduling edits carry the displayed revision; stale saves fail. Retrying the same command reuses the saved result and does not create another appointment, participant set or proposal. Concurrent reservations share a database lock and check the final required identities and rooms across organisations, without revealing another booking's details. Drafts and terminal appointments release their slots; optional attendees do not create hard conflicts. Inconsistent historical bookings remain conservative review blockers for related people or rooms.

Request deadlines come from the server and end at the earlier of 24 hours or the appointment start. Ordinary edits, partial responses and resend do not renew them. Expired requests reject late confirmation. **Issue new 24-hour request** explicitly rechecks availability and renews a released request. A logical deadline applies immediately even without a cleanup worker; the migration installs an expiry job only where `pg_cron` already exists. Upcoming profile/dashboard treatment is still Phase 4, and durable general delivery remains Phase 5.

Unchanged attendees retain their participant IDs, responses and tokens. Removal revokes the attendee and token while preserving the row and response history. The database permits a signed-in attendee to respond only for themselves; managers cannot impersonate an attendee. Read-only attendees see their own participant row rather than other people's response tokens. Existing independent matter/ownership permissions remain valid after attendance removal. General replacement proposals retain the confirmed original until every required attendee approves. Optional responses do not block approval. A sole required organiser's explicit proposal can apply immediately. Approval persists the proposed timezone and all-day setting, including the exclusive next-day end; rejected or expired proposals retain the original. Completion and its required linked checklist task commit or roll back together. Calendar and lead completion/cancellation screens wait for the verified save.

The append-only migration [`20261008164958_calendar_atomic_reservations.sql`](../../supabase/migrations/20261008164958_calendar_atomic_reservations.sql) follows Phase 2's `20261008163445_appointment_end_instant.sql`. It adds the command endpoints, server hold metadata, private retry receipts and response history, conflict and response guards, and scoped invitation context. It preserves existing attorney and three-party commands; professional commands retain their explicit firm/matter permission checks behind a server execution boundary. Neither migration has been applied remotely. Release must apply both in order before deploying these callers. No historical holds or outcomes are backfilled.

Run the focused checks from this package with `TZ=UTC`, then `TZ=Africa/Johannesburg`:

```sh
npx vitest run src/core/appointments/__tests__/appointmentBehaviorBaseline.test.js src/core/appointments/__tests__/appointmentTime.test.js src/core/appointments/__tests__/appointmentReservation.test.js src/lib/__tests__/appointmentSchedulingService.test.js src/lib/__tests__/leadAppointmentHistory.test.js src/hooks/__tests__/leadAppointmentHistoryReader.test.js supabase-tests/calendarReservations.test.js src/pages/__tests__/AppointmentRsvpPage.test.jsx src/services/__tests__/calendarProposalService.test.js --maxWorkers=1
npx vitest run --config vitest.attorney-calendar.config.js --maxWorkers=1
node --test src/core/appointments/__tests__/appointmentRsvpContract.test.js
```

The focused suite passed **143 ordinary checks and six expected known defects (149 total)** under both timezones. It includes 36 database journey/permission/rollback cases and response-page component checks. The existing attorney suite passed **121 checks**, including its management/delivery SQL against the Phase 3 migration. Seven independent two-connection PostgreSQL 17.5 tests passed for simultaneous agent/room bookings, a rolled-back winner, stale edits, a token response competing with an edit, a legacy direct writer and duplicate-command retries. Existing response/proposal endpoints take the reservation lock before locking individual rows, preserving one lock order across old and new routes. The concurrency tests use a private temporary local Unix-socket database, not a remote connection; `calendarReservationsConcurrent.test.js` is opt-in with `CALENDAR_LOCAL_PG_SOCKET` and refuses an arbitrary remote URL. The existing root `npm run check:app` passed: full lint (no errors; existing warnings), the app baseline and the production build.

At Phase 3 handover, the six remaining baseline defects concerned profile attendance, dashboard counts/overdue work, reminder recipient/error handling and reminder preferences. Phase 4 must reconcile calendar/profile/dashboard readers; Phase 5 must persist general delivery choices and durable jobs and verify actual delivery. Archive/mobile workflow, historical correction and connected-provider synchronisation remain in Phases 6–8. There was no authenticated production-browser journey, remote write, deployment or test email in this implementation. Local SQL and component evidence does not certify live invitation/reminder delivery.

## Phase 4 implementation and verification

Calendar, agent profile, directory and dashboard now share appointment identity and lifecycle rules. Account IDs, email aliases, the organiser/creator and current co-agent attendance associate the same master booking with an agent. Display names and revoked attendance do not grant association. The existing server readers still enforce organisation, membership, lead and private-field permissions; this phase does not widen those permissions.

Upcoming means a future, live held or confirmed reservation. Drafts and terminal appointments do not enter upcoming counts. In-progress appointments stay in today's schedule and do not replace the next future booking. Expired holds, invalid scheduling fields and ended appointments without an outcome are follow-up work, preserving their master ID and responses. A replacement request retains a previously confirmed original reservation. Profile history includes terminal records even when their date is in the future. Calendar grids, labels, navigation ranges and reader summaries use SAST workspace days and the appointment's named timezone to interpret its stored fields. Month navigation clamps month-end instead of skipping a month.

The independent appointment reader refreshes after local CRM mutations, on focus, reconnection and becoming visible, and every 30 seconds while visible. This is bounded authenticated polling: it handles other users/devices without relying on a live Realtime publication or row counts as a revision. Financial and directory hydration no longer gate appointment refreshes. Scope keys include organisation, viewer, target agent/lead/listing and selected range. Responses from obsolete scopes or attempts cannot replace a newer snapshot. Timeouts and malformed reads are failures. Network/permission RPC errors do not silently fall through to an empty direct query; unreadable attendance fails the entire appointment snapshot. Schema-compatible direct reads retain revision, ownership and hold metadata.

Calendar, profile, dashboard and mobile calendar distinguish an initial unavailable read from a verified empty result. They retain the last verified rows during refresh or failure, identify stale data and offer Retry. Counts are unavailable until an initial snapshot is verified. The mobile reader also refreshes its selected week; mobile appointment actions remain Phase 6. Logical hold expiry is reflected on refresh even when rows have not changed.

From this package, run the focused suite with `TZ=UTC`, then `TZ=Africa/Johannesburg`:

```sh
npx vitest run src/core/appointments/__tests__/appointmentBehaviorBaseline.test.js src/core/appointments/__tests__/appointmentTime.test.js src/core/appointments/__tests__/appointmentReservation.test.js src/core/appointments/__tests__/appointmentReadModel.test.js src/lib/__tests__/appointmentSchedulingService.test.js src/lib/__tests__/leadAppointmentHistory.test.js src/hooks/__tests__/leadAppointmentHistoryReader.test.js src/hooks/__tests__/usePipelineAppointments.test.jsx src/components/appointments/dashboard/__tests__/AppointmentDashboardSection.test.jsx src/modules/agency/agents/__tests__/agentPerformanceDataService.test.js src/pages/mobile/__tests__/MobileCalendarPage.test.jsx supabase-tests/calendarReservations.test.js src/pages/__tests__/AppointmentRsvpPage.test.jsx src/services/__tests__/calendarProposalService.test.js --maxWorkers=1
node scripts/appointment-query-range-phase2.test.mjs
node scripts/appointment-dashboard.test.mjs
```

The focused suite passed **198 ordinary checks and three expected reminder defects (201 total)** in both timezones. Coverage includes actual local SQL access boundaries, co-agent and revoked attendance, canonical lifecycle parity, hold expiry, same-count edits, automatic refresh/cleanup, stale responses, account switches, timeouts, failed attendance/network reads, Retry, verified empty results, SAST midnight and named-zone legacy fields. The existing attorney suite passed **121 checks**; save-feedback, background-reload and RSVP contract checks passed. The primary-app `npm run check:app` passed: full lint with no errors, all nine established baseline suites and the production build. Existing lint and bundle-size warnings remain.

Phase 4 introduces no database migration. Phases 2 and 3's prepared migrations still need application in order before release. No live data, publication, deployment or emails were changed. An authenticated two-session live journey remains a release check: create, confirm, move, cancel and complete a booking; verify calendar/profile/dashboard after another session's edits and a reconnect. Polling provides eventual consistency within its interval plus read latency; server reservations remain authoritative. General reminder durability and delivery are Phase 5, archive and complete agent/mobile actions Phase 6, historical repair Phase 7 and connected provider synchronisation Phase 8.

## Phase 5 implementation — durable ordinary appointment delivery

The primary transaction workspace now saves invitation choices, reminder choices, calendar attachment choices and per-booking reminder rules separately. Type defaults and selected email themes survive save/reload; the 30-minute-only choice replaces the default reminder schedule. A versioned save endpoint persists the booking, attendees and delivery jobs in one transaction and returns a verified revision-bound queue receipt. An old server cannot accept this endpoint without the delivery migration. The general browser save no longer sends mail or starts an unawaited delivery task.

The new service-only worker runs from an every-minute Vault-backed schedule. Claims use `FOR UPDATE SKIP LOCKED`, bounded attempts and a five-minute recovery lease. The dispatch gate rechecks the claim, current revision, participant profile/email/role, saved choices, visibility, closed outcomes and the effective reservation deadline. Shared recipient email opt-outs and verified calendar bounces/complaints/suppressions also prevent further email jobs, while the internal in-app route stays independent. Removed or declined attendees, expired holds, old schedules and missed reminder windows are superseded. Creation schedules only future offsets; each reminder expires 15 minutes after its due time, preventing a restart from replaying a backlog. The first appointment payload and fully rendered provider message are frozen before sending, so branding changes cannot alter a retry under the same provider idempotency key. The calendar send route requires service credentials. Up to five attempts use exponential delays; a provider-reported bounce, complaint or suppression ends retries.

Internal in-app jobs use the profile ID; external email attendees need no fabricated user identity. Successful in-app persistence is a delivered receipt. Email calendar attachments use the saved UTC start/end instants, retain event UID/revision on cancellation, preserve repeated daylight-saving clocks, and use exclusive date boundaries for all-day events. Email acceptance requires a real provider message ID and remains **provider accepted** until the signature-verified Resend webhook confirms delivery. The private receipt ledger deduplicates provider events and reconciles confirmations that arrive before the worker receipt. Retryable webhook storage failures return an error before shared audit deduplication can swallow a retry. A provider failure wins over delayed positive events. Frozen email payloads, including RSVP tokens, are excluded from authenticated table reads and save receipts.

No-show and completion notices use an appointment update, preserve the actual outcome and omit response links; a no-show is not described as a cancellation. The appointment editor exposes independent invitation/reminder switches, the type-default or 30-minute-only schedule, and current delivery status with Retry. Save feedback reports persisted queued work and prepared attachments; it does not treat an empty result, browser marker or provider acceptance as confirmed inbox delivery. Existing legacy notification helpers now use profile IDs and surface persistence failures before sending. When an ordinary historical booking is next saved through the verified command, it adopts durable delivery and cancels its old pending reminder rows; the migration does not bulk repair or send historical records.

Dedicated attorney and three-party viewing invitation queues retain their existing ownership. The new queue adds persisted reminders to viewing bookings saved through the command, without duplicating their invitation messages or replacing their response rules. Attorney reminders retain their dedicated worker. Attorney migrations are exercised together with the new migration; their existing worker still requires its verified rollout. Historical correction and remaining specialist/general workflow consolidation belong to the later repair/release work.

Verification passed: the full calendar regression set had **245 ordinary checks in both UTC and SAST**, with no expected failures. After the final recipient/theme/attachment review, **75 delivery/service/component checks** passed in both timezones; the final **24 local SQL queue/schedule cases** also passed in both, including the scheduler's SQL with local `pg_net`/`pg_cron` adapters. The worker payload tests passed 11 cases. The existing attorney suite passed **121 checks** with the new migration included in its management fixture; the initial five-second timeout under shared-machine load passed on rerun with a 30-second limit. Independent PostgreSQL 17.5 connections passed **nine concurrency checks**, including competing worker claims and preparation blocked behind cancellation. Three real Edge HTTP handlers passed local authorization/signature/retry tests. The email suite passed 40 checks, covering five attachment/rendering cases, 34 existing branded-template regressions and the sender authorization check. Edge type checks, focused lint (no errors), existing save-feedback/background-reload/query-range/dashboard/RSVP checks passed. The primary-app `npm run check:app` passed full lint (zero errors, 566 existing warnings) and all nine established baseline suites. Its production-build stage was stopped after approximately 20 minutes in transformation under severe shared-machine memory pressure: three concurrent builds on an 8 GB machine. No build success or failure was established; the production build and subsequent login probe require a clean rerun before release. These tests use local databases and controlled provider adapters; they do not certify remote delivery.

Prepared append-only migrations, after the Phase 2 and 3 migrations:

- `20261008184511_calendar_durable_notifications.sql`: choices, scoped receipts, atomic save, queue, worker claim/validation/completion and provider reconciliation.
- `20261008184859_calendar_delivery_worker_schedule.sql`: Vault-backed one-minute invocation.

Release still requires explicit approval: apply the prepared migrations in order, deploy `calendar-appointment-delivery-worker` and the updated `resend-webhook` and `send-email` functions alongside the app, verify Vault's project URL/service key, the worker's `ARCH9_APP_URL`, and `RESEND_WEBHOOK_SECRET` with the required provider webhook subscriptions, and verify the existing attorney/viewing workers. Run a controlled-recipient live booking/reminder journey with actual provider and webhook receipts before certifying production delivery. No migration application, deployment, remote appointment changes or real emails were performed for this implementation. An external request already accepted by the provider cannot be recalled; concurrent cancellation prevents subsequent jobs and preserves any in-flight provider evidence without resurrecting the obsolete job.


## Phase 6: agent workflow and reversible history

Implemented in the primary transaction workspace. Standalone calendar creation starts with an intentional type, responsible agent and optional linked record. The form is authoritative: a lead left open elsewhere cannot supply the booking's owner, contact or linkage. Lead scheduling keeps its explicit context. Managers can choose another responsible agent; adding a co-agent retains their profile identity for calendar/profile/dashboard attendance. Changing the type replaces its template instructions and effects. Draft saves retain a valid schedule without holding time, creating delivery jobs or advancing the linked lead's booking workflow. Issuing the draft uses the same conflict and 24-hour hold rules as a new request. Evening and weekend property appointments remain possible; travel/buffer advice is visible without blocking a save.

Desktop details open the actual authorised appointment from a copied or summary link, including bookings outside the initially visible range. The `/calendar` alias retains the query. Details use refreshed calendar rows; editing retains the revision captured when the form opened, so another session's edit blocks an overwrite. Shared controls provide own invitation response, confirmation after required acceptance, cancellation, completion/no-show after the start, and a new request for an expired future hold. A proposed replacement displays the original booking, proposed named-zone schedule and response deadline; a failed or unavailable proposal read disables response and offers Retry. Attendees never gain management controls or another participant's response controls.

Active work, history/drafts and archived records have separate selectors in desktop and mobile calendar. Archive requires a reason and management access and is limited to drafts and terminal records; active or expired active requests must be cancelled first. Restore changes visibility only. The original status, reservation metadata, participant identities and RSVP history remain intact. Archive supersedes outstanding jobs and pending legacy reminders. Restoring a record cannot recreate old delivery, renew a hold, reactivate a response token or reopen a cancelled appointment. Archived appointments are excluded from upcoming/follow-up counts and cannot be edited or reissued until restored. There is no permanent-delete action.

Mobile supports details, typed standalone or lead-linked creation, responsible-agent selection, external attendees and profile-linked co-agents, editing, draft/issue, invitations/reminders, own response, cancellation and archive/restore. The existing modal traps focus, restores focus on closing and scrolls within a phone viewport. Failed saves stay open with an error; duplicate clicks are blocked; an unchanged retry retains its command ID. A workspace switch closes the old editor and ignores late callbacks. Confirmed ordinary time changes propose a replacement rather than silently moving the original; the feedback explains that other form edits are not saved by that proposal. Dedicated attorney/viewing ownership and response commands remain in place; specialist rescheduling still follows their existing coordination workflows. Manual Google/Outlook links remain copies, with connected provider synchronisation reserved for Phase 8.

The append-only migration [`20261008193925_calendar_agent_archive_workflow.sql`](../../supabase/migrations/20261008193925_calendar_agent_archive_workflow.sql) follows the prepared Phase 2, 3 and 5 migrations. It adds archive fields, a private audit trail, scoped/idempotent archive commands and guards against editing archived history; scoped calendar and lead readers expose the archive state. Archive uses the existing scheduling lock and mutation receipt namespace. The schema change has not been applied remotely.

Verification: **274 calendar checks passed in both UTC and Africa/Johannesburg across 24 files**. These include seven actual local SQL archive/permission/retry/rollback cases, mobile creation/edit/stale-save/proposal/co-agent tests, own-action and proposal-read tests, stable participant retries, draft-versus-issued conflicts, and the existing reader/delivery regressions. The attorney suite passed **121 checks** with the new migration. **11 independent PostgreSQL 17.5 concurrency checks** passed, including archive competing with draft issuance and worker preparation. The existing query-range, dashboard, background reload and save-feedback checks passed; the legacy RSVP check passed its **17 local response scenarios** after its obsolete source assertion was aligned with the current verified-row variable. The app baseline and full lint passed (zero errors, 571 warnings); the production build completed. Final focused lint and the final production build were repeated after the frontend review. Local Playwright used the real mobile components and an isolated PGlite database through a controlled HTTP adapter: an evening draft retained its time and custom reminders, archive removed it from history, restore preserved its draft status without jobs, issuance created a request and cancellation returned it to history. It does not use the live application account or prove remote mail delivery.

Release requires explicit approval to apply the prepared migrations in order and deploy the callers/workers, then the controlled two-session and actual-provider journeys already described in Phase 5. These checks do not certify the historical appointments or connected calendars. Historical repair remains Phase 7; provider connections remain Phase 8. No remote appointment writes, migrations, deployments or real emails were performed.


## Phase 1 completion and later release gates

Phase 1 is complete when the lifecycle, reservation, ownership, permissions, screen expectations and notification rules are defined; all 42 audit scenarios have an acceptance check and repair phase; and the confirmed function-level failures reproduce under UTC and SAST with passing controls.

Later repair phases must promote their baseline cases to ordinary passing tests and add the missing failure-path checks. Release requires the appropriate primary-app verification, a controlled complete appointment journey, actual delivery receipts, negative permission checks, and a scoped recovery plan. Production data correction, migration application, deployment and test emails require explicit approval for the specific action under the repository release rules.

## Phase 7: reviewed historical reconciliation

Phase 7 adds historical reconciliation to the primary transaction workspace and its shared calendar database layer. It reports each appointment independently: inconsistent clocks, missing end/duration evidence, legacy lifecycle labels and holds, unresolved past outcomes, attendance/profile and organisation links, duplicate or unreachable attendees, open old replacements, historical overlaps/current reservation conflicts, obsolete reminders/jobs, delivery failures and unverified external sync. Explicit demo records and specialist/archive workflows remain separate. The report contains appointment/profile identifiers but excludes names, addresses, titles and response tokens.

The [original inventory review](/Users/alexanderlandman/the-it-guy/tmp/calendar-phase7-20261008/historical-inventory-review-final.md) replays the **8 October snapshot around 17:44 SAST**, not a fresh production read: **56 appointments, 47 operational and 9 explicitly demo; 37 operational past outcomes need owner review; one operational time mismatch; 29 historical overlap pairs**. Five operational records lack duration evidence. The inventory never exported `end_date_time`, so its missing-end counts describe missing evidence in that export, not proof that every current row lacks an end. Original attendee/reminder/log counts cannot establish delivery. Historical overlaps do not establish a current conflict or determine which appointment should win. Unflagged records may also include testing, as the original audit explains.

`src/core/appointments/appointmentReconciliation.js` provides the pure analyser. `scripts/reconcile-calendar-appointments.mjs` provides report, scoped snapshot, plan preview/apply, guarded recovery and read-only receipt retrieval. The prepared append-only migration [`20261008202747_calendar_historical_reconciliation.sql`](../../supabase/migrations/20261008202747_calendar_historical_reconciliation.sql) implements server-only export/repair/recovery endpoints, private audit and revision-specific delivery suppression. **Applying the migration alone repairs no appointment.**

A complete scoped snapshot includes recovery fingerprints over the authoritative appointment, attendees, proposals, reminders and jobs; names, email addresses, job payloads and capabilities are omitted from the export. These fingerprints fence changes, including worker progress and response-link changes. The original redacted 56-row inventory cannot produce a write plan. A fresh snapshot and exact review evidence are required for each correction. Draft plans select no records and leave reviewer, reasons and evidence blank. Each batch selects at most 100 unique appointments. Batch identities deduplicate uncertain retries; changed plans cannot reuse them. A read-only receipt command recovers an existing result after the 24-hour snapshot/approval window closes and reports whether subsequent state changed.

Supported corrections are deliberately bounded:

- Normalise a known equivalent status and reservation metadata, deriving an end only from recorded evidence. Holds use the original request plus 24 hours, capped at the appointment start and any earlier saved deadline. The repair never reissues a request or assumes a 45-minute duration.
- Correct a complete, explicitly evidenced **past** schedule only when both stored and local interpretations of the entire old booking are past. Confirmed future or ongoing appointments retain ordinary replacement approval rules. Contradictory timestamps never choose their own authority.
- Link an existing internal Agent/Co-agent attendance record to its unique, exact, active profile match in the same organisation; preserve the attendance identifier and response history. Ambiguous, external, revoked and cross-organisation matches are rejected.
- Suppress reviewed obsolete historical delivery. Queued/processing/failed jobs become superseded and pending legacy reminders become cancelled; provider receipts remain. No new historical invitation/reminder or cancellation email is created.

Every repair advances the revision and suppresses delivery for that revision, preserving saved invitation/reminder preferences. A later intentional material save or reissue follows ordinary delivery rules at its new revision. Confirmed response deadlines are not shortened to an old request hold; unconfirmed capabilities are capped and past schedule corrections revoke stale links. Agent/profile/dashboard readers already consume these authoritative rows. Past completion/no-show/cancellation, future conflicts, owner/business-link decisions and attendee invitations use existing agent actions, retaining their side effects and approvals. External provider sync stays in Phase 8; repair cannot mark a record synced.

Preview runs the actual mutations and deferred constraints inside a database subtransaction and rolls everything back, including audit and queue effects. Applying is atomic across the batch. Both modes serialize with normal scheduling and worker preparation/completion, lock delivery records and reject any stale fingerprint. Browser/anonymous roles cannot invoke repair or read private audit; only the service role can call it, with an active organisation manager recorded as reviewer. Recovery requires the exact recorded after-state: later edits, responses, proposals or worker/provider progress stop rollback. It restores only the repaired metadata/schedule or profile link at a new revision. It never revives old jobs, revoked links, expired response deadlines or longer holds. A recovery restoring a contradictory display is permitted only for a provably past booking and a private audit entry in that transaction.

### Operator sequence

Run from `the-it-guy/`. Report mode requires no credentials and makes no network calls:

```sh
node scripts/reconcile-calendar-appointments.mjs report --input ../tmp/calendar-audit-20261008/appointment-inventory.json --as-of 2026-10-08T15:44:00Z --output ../tmp/calendar-review.md
node --test scripts/reconcile-calendar-appointments.test.mjs
TZ=UTC npx vitest run src/core/appointments/__tests__/appointmentReconciliation.test.js supabase-tests/calendarReconciliation.test.js --maxWorkers=1 --testTimeout=30000
```

After separately approving and applying the prepared migration sequence, an authorised operator supplies `SUPABASE_SERVICE_ROLE_KEY` through their server environment. The tool never loads `.env`, prints credentials or forwards raw database error detail. All output files are new, private files; it refuses overwriting existing evidence before calling the server. Remote operations require `--environment`, `--project-ref`, `--organisation` and `--url` (or server `SUPABASE_URL`). The URL must match the project reference. This repository's known production project can only be labelled production; local mode is restricted to local origins and reference `local`. The target flags shown below must be supplied explicitly for every remote command:

```sh
node scripts/reconcile-calendar-appointments.mjs snapshot <target flags> --output snapshot.json
node scripts/reconcile-calendar-appointments.mjs report <target flags> --input snapshot.json --output review.md --plan draft-plan.json
node scripts/reconcile-calendar-appointments.mjs preview <target flags> --plan reviewed-plan.json --output preview-receipt.json
node scripts/reconcile-calendar-appointments.mjs apply <target flags> --plan reviewed-plan.json --apply --approval approval.json --output applied-receipt.json
node scripts/reconcile-calendar-appointments.mjs receipt <target flags> --batch <original batch UUID> --output recovered-receipt.json
node scripts/reconcile-calendar-appointments.mjs rollback <target flags> --plan recovery-plan.json --output recovery-preview.json
```

The manager reviews every selected entry, completes `reviewedBy`, the batch reason and per-record reason/evidence, and reviews the preview before approving a write. A real apply additionally requires `--apply` and an explicit approval file binding `approved: true`, `environment`, `projectRef`, `organisationId`, `reviewedBy`, `approvedAt` within 24 hours, a reason, a verified recovery reference and `planSha256`. The digest is the SHA-256 of `JSON.stringify` of the parsed, final plan, available as the exported `planDigest` helper. The snapshot also must be no older than 24 hours. The approval file is an operator guard against unintended changes; it does not replace the repository's requirement for explicit user approval in the current task.

A recovery plan contains `version: 1`, target environment/reference/organisation, a fresh recovery `batchId`, `originalBatchId`, `reviewedBy` and `reason`. Recovery previews by default; an actual recovery requires `--apply` and a new approval for that exact recovery plan and target. Preserve receipts and the private before-state/recovery evidence. Never modify the old plan or reuse its batch identifier for another correction. Resolve rejected changes with a new scoped snapshot and review, not by bypassing fingerprints or deleting history.

Verification: **304 calendar checks passed in both UTC and Africa/Johannesburg across 26 files**, including **20 authoritative SQL repair/preview/recovery tests** and **10 pure inventory tests**. **Six operator-tool checks** passed, covering target identity, exact approval, freshness, evidence, offline reporting and network-free rejection of unapproved writes. The attorney suite passed **121 checks** with the new migration. **15 independent PostgreSQL concurrency checks** passed, including repair versus agent edits, in-flight provider completion, changed receipt fingerprints and simultaneous batch retries. Focused lint passed without errors or warnings, and the diff whitespace check passed. The full calendar/attorney regression selections include the existing workflow, readers, RSVP, delivery worker, mobile and archive coverage. No frontend or dependency change required a new build.

No live record, migration, deployment or real email has been changed by Phase 7 implementation. Actual historical corrections, release and the normal two-session/provider acceptance journey still require explicit approval and verification.


## Phase 8: connected Google and Outlook copies

The primary transaction workspace now offers **Your connected calendar** on the
agent calendar and appointment details, including mobile. An agent can connect
their own Google or Outlook account for the active organisation, inspect persisted
sync status, reconnect, disconnect, retry failed work and review outside changes.
A principal viewing another agent's appointments still manages their own connection;
one person's connection cannot mark another person's appointment copy synced.
Manual Google/Outlook links and ICS downloads are labelled as manual copies.
Previously made manual copies are not matched or removed automatically.

The selected default is **review outside changes before applying them**. The
implementation question was presented during this phase; no alternative was
selected. Arch9 remains authoritative for booking status, reservations, participants,
RSVP, reschedule approvals and reminders. Ordinary and specialist appointment
changes enqueue personal copies without replacing their existing delivery ownership.
Provider copies use the saved UTC instants and named timezone, private visibility,
exclusive all-day dates and current busy/free state. Initial connection backfills
eligible future/in-progress personal bookings. Existing completed/no-show/past
confirmed copies become transparent history. Cancellation, decline, archive,
removed attendance, lost organisational scope and expired unconfirmed holds remove
the managed copy. Inconsistent schedules and repair-suppressed revisions require
review instead of a guessed external appointment. This phase does not repair old
records or send historical messages.

Each provider copy omits attendees, client identities and private notes. Provider
reminders are disabled, leaving Arch9's invitation/reminder pipeline as the delivery
owner. Google requests also use `sendUpdates=none`. When an outside user adds guests,
the worker refuses even a requested restore/delete because changing those guests
could send provider mail. Outside recurring series and Outlook online meetings also
require manual provider cleanup or pausing the copy; restoring must not discard a
meeting blob or alter an unapproved series. Google updates patch only owned fields,
preserving personal colours. These choices follow the provider contracts:
[Google event insertion](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert),
[Google conditional changes](https://developers.google.com/calendar/api/guides/version-resources),
[Google patch semantics](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch),
[Outlook creation](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0)
and [Outlook update precautions](https://learn.microsoft.com/en-us/graph/api/event-update?view=graph-rest-1.0).

Outside title/body/time/location/privacy/reminder changes and deletion produce a
persisted review, leaving the booking unchanged. The agent can restore the current
Arch9 copy or stop syncing it. Restoring is bound to the reviewed remote content
hash and current review token; another outside change requires a fresh review.
Deletion restore uses a new creation identity to avoid reusing a provider tombstone.
Agents accept a reschedule or cancel a booking through normal Arch9 actions, retaining
all existing approvals and side effects. There is no import of unrelated personal
events or external busy availability, automatic application of outside edits,
shared/delegated calendar selection or provider webhook subscription in this phase.

### Security, durability and operation

Account connections use server-side OAuth authorization code exchange, PKCE and
random, single-use, ten-minute state bound to user, organisation, provider and
connection generation. A callback is public, but initiation validates the current
session with `auth.getUser`; connection and status RPCs enforce active membership
and the authenticated owner. Callback destinations are constrained to the configured
HTTPS app origin. Google requests owned-event permission plus verified identity;
Outlook uses delegated calendar read/write and basic identity permissions. Refresh
credentials are AES-256-GCM encrypted with a server-only 32-byte key and connection
ID as authenticated data. Private tables, decrypted credentials, OAuth verifier,
remote identifiers and worker payloads are unavailable to browser/anonymous roles.
Errors and worker responses exclude raw vendor bodies and secrets.

Deferred appointment/attendee triggers persist versioned desired work in the same
transaction. Worker preparation and preflight re-evaluate saved scope, hold expiry,
repair suppression and the current target. Connection leases last five minutes;
per-event claims have independent identities. Refresh-token rotation uses a lease
and prior-ciphertext compare-and-set. Disconnect wipes the app credential, advances
the generation and invalidates pending authorization/work. Provider access already
in flight cannot be recalled; late receipts are retained privately and cannot revive
a disconnected connection. Existing provider copies remain as manual copies, as
explained before disconnect. The provider's consent grant is not revoked by the
local disconnect; agents can revoke it in Google/Microsoft settings. Reconnect is
restricted to the same account so old remote event IDs cannot target another mailbox.
Changing accounts requires a separate explicit detach/migration workflow.

Managed copies have stable identity across ordinary edits. Google uses a
client-supplied deterministic event ID. Outlook uses a stable `transactionId` and
an exact custom-property lookup before creation. Unknown creation receipts adopt
only owned copies whose stored content matches the frozen initial payload. Duplicate
Outlook matches require review; arbitrary pagination URLs are never fetched.
Conditional writes require the observed ETag; a failed precondition requires review.
Unchanged verified polls update their check timestamp without appending audit rows;
meaningful changes, failures, outside reviews and late creation receipts remain recorded.
Actual provider IDs, ETags and verified stored content are required for a synced
receipt. A lost response, concurrent Arch9 edit or cancellation cannot mark an
obsolete target synced. A created event discovered after a cancellation remains
mapped for cleanup. Provider throttling has bounded backoff and five attempts;
failed work remains visible with Retry, and revoked authorization requires reconnect.

The Vault-backed cron runs every minute, claims at most five connections and handles
at most ten managed events per connection within a bounded time budget. Connections
are selected by oldest check to avoid starving another agent. Synced copies become
due for outside-change polling after five minutes. These are due times, not a fixed
end-to-end latency guarantee: backlog, provider latency, throttling and outages add
delay. There are no browser-owned sync timers or provider tokens. The panel reloads
status on visible polling, focus and reconnect, retains errors and verified snapshots,
and ignores late results/actions after a viewer or workspace switch.

### Setup and live acceptance

The append-only migrations are
`20261008205719_calendar_connected_provider_sync.sql` and
`20261008210940_calendar_provider_worker_schedule.sql`, after the prepared earlier
calendar migrations. Apply no remote migration or release without explicit current-task
approval and the repository's target/recovery checks. Deploy
`calendar-provider-connection` and `calendar-provider-sync-worker` together with
this source. Both disable gateway JWT verification in `supabase/config.toml`:
the callback must accept OAuth GET; initiation verifies the user explicitly, and
the worker independently requires the exact service-role bearer credential.

Configure the following secrets only on the server; never put them in `VITE_*`
variables or frontend files:

- `ARCH9_APP_URL`: the canonical HTTPS application origin for that environment.
- `ARCH9_GOOGLE_CALENDAR_CLIENT_ID` and `ARCH9_GOOGLE_CALENDAR_CLIENT_SECRET`.
- `ARCH9_MICROSOFT_CALENDAR_CLIENT_ID`, `ARCH9_MICROSOFT_CALENDAR_CLIENT_SECRET`
  and optional `ARCH9_MICROSOFT_CALENDAR_TENANT` (default `common`).
- `CALENDAR_PROVIDER_ENCRYPTION_KEY`: base64 encoding of exactly 32 random bytes.
  Preserve it securely across deployments. Changing it makes old encrypted
  credentials unreadable and requires controlled reauthorization or key migration.
- Existing server `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; existing Vault
  `arch9_project_url` and `arch9_service_role_key` used by the scheduled dispatcher.

Register exact callback URLs in the respective OAuth application:
`<SUPABASE_URL>/functions/v1/calendar-provider-connection?provider=google` and
`<SUPABASE_URL>/functions/v1/calendar-provider-connection?provider=outlook`.
Enable the Google Calendar API and complete the applicable provider consent/test-user
configuration. Validate the Microsoft tenant/account support and the permitted
all-day timezones for the controlled account. A missing provider setup must produce
an authorization/configuration failure rather than a simulated connected receipt.

Live acceptance remains required with approved test accounts and bookings:
connect each provider; cancel consent; reject a wrong-workspace/expired session;
create a timed and all-day appointment; edit/reschedule/confirm/cancel/archive it
from another session with the first browser closed; inspect the actual provider
copy, times, ETag, stable ID and private visibility. Confirm exactly one managed
copy, no provider guests and no duplicate invitation/reminder mail. Edit/delete it
in the provider; wait for review; race another outside edit against restore; restore
a deletion; pause and resume; revoke consent; reconnect the same account;
disconnect during in-flight work; exercise failed/throttled/lost responses and queue
recovery. Check calendar/profile/dashboard continue to reflect the authoritative
Arch9 booking. Verify the deployed cron and Vault target, negative permissions and
actual provider conditional-write/idempotency behaviour, including Outlook's
extended-property roundtrip and supported all-day timezone representation.

### Local verification

The focused selection covers actual local SQL authorization/state/queue/hold/scope/
schedule dispatch, controlled Google/Outlook transport, encrypted worker execution,
lost receipts, concurrency, callback security and desktop/mobile components. Tests
use local PGlite/PostgreSQL plus controlled HTTP adapters; they do not certify live
provider integration. From this package, run:

```sh
TZ=UTC npx vitest run supabase-tests/calendarProviderSync.test.js supabase-tests/calendarProviderTransport.test.js supabase-tests/calendarProviderWorker.test.js src/services/__tests__/calendarProviderService.test.js src/components/appointments/__tests__/ConnectedCalendarPanel.test.jsx --maxWorkers=1 --testTimeout=30000
TZ=Africa/Johannesburg npx vitest run supabase-tests/calendarProviderSync.test.js supabase-tests/calendarProviderTransport.test.js supabase-tests/calendarProviderWorker.test.js src/services/__tests__/calendarProviderService.test.js src/components/appointments/__tests__/ConnectedCalendarPanel.test.jsx --maxWorkers=1 --testTimeout=30000
npx vitest run --config vitest.attorney-calendar.config.js --maxWorkers=1 --testTimeout=30000
```

From the repository root, the real Edge entrypoints have local authorization tests:

```sh
deno test --allow-env supabase/functions/calendar-provider-connection/index.test.ts supabase/functions/calendar-provider-sync-worker/index.test.ts
deno check supabase/functions/calendar-provider-connection/index.ts supabase/functions/calendar-provider-sync-worker/index.ts
npm run check:app
```

Independent PostgreSQL tests accept only an explicit isolated local calendar-test
Unix socket (`CALENDAR_LOCAL_PG_SOCKET`), never a remote database URL. No provider
account connection, live appointment mutation, email, remote migration or deployment
has been performed by this implementation.


Final local verification passed **386 calendar checks in both UTC and
Africa/Johannesburg across 31 files**, including **82 Phase 8 SQL, transport,
worker, service and component cases**. The existing attorney selection passed
**121 checks** with the provider migration loaded. Independent PostgreSQL 17.5
connections passed **21 concurrency checks**, including six provider claim,
lease, cancellation/edit, disconnect and callback races. Both real provider Edge
entrypoints passed their local HTTP authorization checks; Deno type checks and
lint passed. `npm run check:app` passed full lint (zero errors, 570 existing
warnings), all nine established baseline suites and the production build. After
final source refinements, focused lint passed with only the existing mobile
reader effect warning, and the production build/login-probe command passed again
(48.56 seconds for Vite). The isolated local PostgreSQL cluster was stopped.
The focused diff whitespace check passed. Provider review hashes remain separate
from verified sync baselines, so pause/resume or reconnect cannot silently accept
an outside edit. Failed interface actions remain visible when a later background
status read succeeds. These are local proofs; OAuth configuration, approved
release and controlled real Google/Outlook acceptance remain outstanding.


## Phase 9 — joined acceptance and controlled release

The primary transaction workspace now has one local acceptance entry point:

```sh
CALENDAR_LOCAL_PG_SOCKET=/absolute/path/to/calendar-phase3-local/socket node scripts/check-calendar-acceptance.mjs --output ../tmp/calendar-acceptance-<unique-run>
```

Run from `the-it-guy/`. Use the existing isolated PostgreSQL fixture described above (the concurrency suites enforce its local socket/port/user), and put `deno` on PATH. The runner does not start or stop a database, apply migrations, deploy, connect provider accounts or send messages. It refuses to overwrite old evidence. A missing runtime, skipped test, incomplete suite, failed check, unmapped scenario or source change during execution prevents local acceptance. Run `node --test scripts/check-calendar-acceptance.test.mjs` for its evidence-validation regressions.

`config/calendar-acceptance.json` carries the original **A01–A42 IDs and requirements**, the exact test files and assertion selectors, eight ordered migration digests, seven required function entry points and the remaining hosted acceptance gates. The runner executes the entire focused calendar selection in separate UTC and SAST processes, the dedicated attorney suite, native PostgreSQL concurrency, the historical operator checks, real Edge-handler authorization/signature tests and root `check:app`. It writes logs, Vitest JSON, scenario-to-assertion receipts and a Markdown/JSON report under the new output directory. Both timezone stages must contain the selected evidence; process success alone is insufficient. Reports include the source fingerprint before/after, runtime version and timestamps. A subsequent source change requires a fresh run.

The new joined journeys use the actual mobile form and public appointment services with migration RPCs in an isolated PGlite database. They verify calendar/profile/dashboard agreement for a co-agent, evening creation, custom reminder persistence, browser closure followed by server dispatch and controlled receipts, lost-save replay, adding attendees while editing, revoked external responses, rescheduling/cancellation of already claimed work, and cross-organisation/removed-member denial. They found and repaired a save mismatch: temporary UUIDs on new form attendees were sent as saved attendance IDs. Creates now discard those temporary IDs; edits retain only IDs present in the verified current attendance. Required attendee changes still request fresh approval without extending the original 24-hour hold.

These are **local regression receipts**, not complete customer acceptance. PGlite uses minimal prerequisite tables/policies and a mock digest. Native tests exercise independent PostgreSQL transactions, not the complete platform migration chain. jsdom exercises components, not an actual mobile browser. Controlled provider/mail HTTP and webhook fixtures cannot prove a hosted scheduler, inbox delivery or real Google/Outlook behavior. A03 seller side effects and A15 travel-warning presentation still need the browser/pilot journey specified below. The report always keeps `releaseReady: false` and lists the live gates as pending; no local test can silently promote them.

### Release scope and order

The Phase 9 release scope pinned these eight calendar migrations, in this order. Phase 10 adds the two dependencies listed in its section below; the current acceptance manifest pins all ten:

1. `20261008163445_appointment_end_instant.sql`
2. `20261008164958_calendar_atomic_reservations.sql`
3. `20261008184511_calendar_durable_notifications.sql`
4. `20261008184859_calendar_delivery_worker_schedule.sql`
5. `20261008193925_calendar_agent_archive_workflow.sql`
6. `20261008202747_calendar_historical_reconciliation.sql`
7. `20261008205719_calendar_connected_provider_sync.sql`
8. `20261008210940_calendar_provider_worker_schedule.sql`

Existing appointment, membership, visibility, attorney and viewing prerequisites must be checked against the target catalog/history; this list does not certify their deployment. Follow the repository [database release runbook](../../docs/database-release-runbook.md), including its current direct-production pilot rule. Target identity and recovery checks remain mandatory. The source is in a shared dirty working tree: select and review the owning app/function dependency changes in an isolated release checkout before preparing the application commit. Do not release every pending file or infer a release commit from a test fingerprint.

| Increment | Concrete scope | Gate before continuing |
| --- | --- | --- |
| Preparation | Local acceptance, exact source/migration hashes, approved target, recovery evidence and named controlled recipients/agents | `supabase:guard`, `supabase:push:lock-recovery`, exact migration dry-run and target catalog/prerequisite review; explicit approval for that release |
| Database and delivery | Migrations 1–6; calendar delivery worker, `send-email`, `resend-webhook`, attorney delivery worker and listing viewing notification worker | Verify deployed RPC definitions/grants/private isolation, hosted role negatives, scheduled worker receipts and controlled invitation/reminder/webhook journey |
| Application pilot | Reviewed primary app calendar/service/profile/dashboard/mobile changes | Real desktop/mobile creation, edit, responses, drafts, cancellation, archive/restore, stale edit and reconnect; profile/dashboard match the same saved revision; attorney and seller workflow compatibility |
| Provider pilot | Migrations 7–8; connection and provider sync functions, OAuth registrations and server secrets | Both real Google/Outlook test accounts: one-copy create/edit/cancel, disconnect/reconnect, outside edit/deletion review and conditional-update behavior |
| Wider rollout | Named initial agents finish the agreed scenarios, feedback reviewed and support owner recorded | Explicit acceptance of the pilot evidence and approval to expand |

Scheduling migrations register workers immediately. Deploy compatible worker/sender/webhook code and verify configuration before enabling either scheduled job; pause the new job in the approved deployment transaction if those dependencies are not ready. Existing attorney/viewing jobs and notification types require separate compatibility verification. There is no implemented per-cohort scheduling flag: restrict acceptance to controlled test records/accounts and limit pilot access operationally, rather than claiming the manifest limits recipients.

Vault needs `arch9_project_url` and `arch9_service_role_key` bound to the approved target. Verify `ARCH9_APP_URL`, the sender configuration and `RESEND_WEBHOOK_SECRET`. Provider setup uses the Phase 8 server-only OAuth/encryption settings. Check configuration by presence and target, never paste credentials into evidence. Deploy the exact function artifacts and record their deployment IDs, frontend commit/deployment and live route. Do not record a successful release if only a build or HTTP 200 exists.

### Live acceptance evidence

The five pending gates in the manifest require:

- **Hosted access:** allowed owner, co-agent and principal operations; dedicated attorney actions; external token scope; denials for wrong organisation, removed member, wrong attendee and anonymous direct mutation. Inspect actual hosted grants, RLS and private-schema isolation; run an available security advisor and complete clean migration replay/catalog reconciliation.
- **Notification delivery:** approved controlled addresses; appointment/revision/participant/job IDs; close the browser immediately after a verified save; observe actual scheduled reminders after their due time; verify provider acceptance separately from signed delivered/bounced receipts. Cancel a claimed reminder, remove an attendee and reuse an old response link. Verify preferences and short-notice behavior without catch-up mail. Never use customer recipients for certification.
- **Google and Outlook:** approved test accounts on each service; consent, reconnect, one stable copy after edit/retry, cancellation removal, and an outside edit/deletion that requires review. Record provider copy/revision IDs, exclude credentials/tokens, and verify actual Outlook concurrency protection.
- **Real browsers:** desktop and narrow mobile, UTC/SAST device settings, far-future navigation and SAST midnight; shared appointment appears in profile/dashboard; failed refresh retains verified data; offline save is visible/retryable; other-device edits/reconnect converge. Check seller valuation/presentation side effects, linked completion, back-to-back travel warning and exports in actual calendar clients.
- **Agent pilot:** named initial agents complete the agreed real workflows, review unresolved gaps/complaints, record support responsibility and explicitly accept widening access.

A gate needs dated, target-bound evidence and reviewer sign-off. A checked box or imported fixture count is insufficient. Keep response tokens, OAuth credentials, private notes and recipient addresses out of shareable reports; retain restricted controlled-recipient evidence separately.

### Recovery and post-release checks

Before release, preserve the previous frontend/function artifacts, cron activation state, target schema/function definitions and an approved backup/recovery point. Prepared metadata reconciliation performs no automatic historical repair; any reviewed Phase 7 data correction still needs separate exact-record approval.

If a pilot fails, stop widening access and pause only `arch9-calendar-appointment-delivery-1m` and/or `arch9-calendar-provider-sync-1m` as appropriate using the approved target's `cron.job.active` controls. Record already accepted emails and remote provider copies before retrying; in-flight external requests may still complete. Preserve the database jobs, private receipts, revisions, capabilities and audit. Pause affected provider events through existing scoped actions if needed. Re-enable jobs only after verifying the current revisions and saved delivery preferences; do not backdate reminder jobs or generate replacement messages to hide a failure.

Do not drop the new tables or replay/delete migration history to recover. Prefer a forward schema/function correction. Reverting the frontend or worker is safe only when that artifact remains compatible with the new reservation, queue and access guards; otherwise hold the affected action and ship a compatible correction. Restore reviewed historical metadata only through the existing guarded reconciliation rollback, which never revives old invitations or hold deadlines. Real mail already sent cannot be recalled; disconnecting leaves provider copies as manual events, as documented in Phase 8.

After each increment, verify target migration history and RPC/role boundaries, deployment IDs/live route, scheduler execution, saved revision agreement across calendar/profile/dashboard, due-job and signed receipt outcomes, revoked links, removed/cancelled provider copies, and dedicated attorney/viewing behavior. Record partial release state and stop on failure. Local implementation of Phase 9 is complete only with passing local evidence; full Phase 9 customer acceptance remains pending until these controlled live and pilot gates are actually performed.


## Phase 10 — operational monitoring and support

The primary desktop and mobile calendars expose a scoped **Calendar health** view.
Owners and existing appointment managers can inspect their manageable bookings;
connection owners and active workspace managers can see permitted connection
problems. Read-only co-agents cannot perform support actions. Removed members,
anonymous callers and other workspaces are denied. An old personal copy of a
booking moved to another workspace exposes no destination title or inspect action.
Support access always uses current database membership and appointment permission.

The health read checks current state when loaded, every minute while visible and
on reconnect/focus. It distinguishes this verified read from the last background
scan. Failed reads retain the last verified result with a visible error and Retry;
workspace/account changes discard old results. Appointment support is loaded only
when opened, refreshes every 30 seconds while visible and keeps recovery failures
visible independently from read refreshes. Reads and actions have a 15-second
client deadline. An uncertain action can be retried with its unchanged command.

### What is monitored

- Notification work overdue by ten minutes, processing claims stalled for five
  minutes, at least three failures, exhausted attempts, missed expiry windows and
  obsolete jobs still awaiting retirement. Recent expired work is inspected for
  seven days; eligible future work is also inspected.
- Missing current-revision invitation history and eligible future reminder routes,
  using saved preferences, attendee identity, required responses and the existing
  dispatch gate. Missing invitations require review and an explicit new booking
  request through the ordinary workflow; support does not reconstruct them.
- Account reconnection requirements, connected accounts not checked for twenty
  minutes, missing eligible personal copies, outside changes requiring review and
  overdue/stalled/repeatedly failing copy jobs. Deliberate disconnect/pause is
  respected. The account owner uses existing reconnect/review controls.
- Contradictory date/timezone/end instants and cross-workspace lead/contact/
  transaction links or inactive/unlinked internal agents. Active ordinary records
  from the last ninety days and all future records are inspected. Support never
  guesses an identity, duration or replacement reservation.

`collect_calendar_health(25)` is scheduled as `arch9-calendar-health-5m`. It is a
server-only, read-only operational collector with private incident/scan receipts:
it sends no messages and performs no repair. A dedicated advisory lock excludes
concurrent scans. Oldest/unscanned workspaces are checked first, up to 25 per run
(maximum 50), with a twenty-second stop between workspaces. Scopes exceeding
10,000 appointments require a scoped operator review. A scan stores at most 1,000
findings; failed or truncated scans cannot resolve unverified incidents. Failed/
partial results remain explicit. Monitoring older than ten minutes is labelled
stale; larger installations may need an approved scheduling/capacity adjustment.
Public health shows at most 100 permitted issues with explicit truncation.

### Support and guarded recovery

Support details show the saved revision, reservation deadline, attendee response
and response time, up to 200 delivery receipts and 100 changes/support actions.
Acceptance, delivery and provider receipt IDs are separate facts. Change history
starts with this release and records actor, revision, status, timing and changed
field names; it does not invent past history or copy private notes. Support
commands include their recorded reason. Payloads, response capabilities, OAuth
credentials and private incident tables remain inaccessible to browser clients.

Both recovery actions take the existing scheduling lock before the booking lock,
require management permission and a current revision, and commit a private
idempotent command receipt. Changing a previously used command is rejected.
Cancelled, closed, archived, dedicated attorney, unmanaged or repair-suppressed
records cannot be revived. Inconsistent schedules or links require review before
recovery; support does not queue work for unlinked or inactive internal attendees.
Recovery cannot renew the user's agreed 24-hour hold,
change booking facts or bypass expiry, saved preferences, removed/declined
recipients, email opt-out or revoked response links.

**Retry eligible delivery** adds one attempt to an exhausted, unaccepted, still
valid job. It preserves the job ID, attempt history and frozen payload rather than
making a replacement message. Existing automatic retries continue independently.
Manual retries are capped at two per job with a two-minute cooldown. Jobs older
than 23 hours are not manually retryable: this conservative limit stays within
[Resend's documented 24-hour idempotency retention](https://resend.com/changelog/idempotency-keys).
The retry deadline also remains in the authoritative dispatch gate: a delayed
worker retires it after the safe window. A queued receipt is not a delivery claim; the worker still verifies eligibility
and records provider acceptance and signed delivery outcomes separately.

**Reconcile future reminders** retires invalid pending work and inserts only
missing, eligible future reminder tuples under the saved revision. Unique route
identities prevent duplicates across concurrent/repeated commands. It does not
reset failed/accepted jobs, recreate invitations, backdate reminders or revive
reviewed historical messages. Changes to a booking still use ordinary edit,
response, cancellation, archive or reviewed historical-repair workflows.

### Local verification and release dependencies

The existing `scripts/check-calendar-acceptance.mjs` runner includes the new health
SQL, service validation, support/health component checks, actual form/service/SQL/
worker recovery and native PostgreSQL retry/reconciliation/cancellation races. It
still runs the original 42 scenario matrix in UTC/SAST, dedicated attorney suite,
operator checks, Edge tests and `check:app`. Local cron verification uses an
isolated schedule fixture; it is not a hosted scheduler receipt.

Append these migrations after the eight Phase 9 dependencies:

1. `20261008220735_calendar_operational_health_support.sql`
2. `20261008221320_calendar_health_monitor_schedule.sql`

No extra Edge Function or provider secret is introduced. Before an explicitly
approved release, use the same target-bound database guard, exact dry-run scope,
recovery evidence and catalog/grants verification from Phase 9 and the release
runbook. Keep source hashes for all ten migrations. After release verify actual
cron execution, owner/principal/co-agent/removed/cross-workspace negatives, a
controlled failed job and current saved revision, its audited retry, eventual
signed receipt and missing-future-reminder reconciliation. Verify that a failed
scan preserves incidents and that deliberate provider pauses remain respected.
Pause only `arch9-calendar-health-5m` if the collector causes an operational issue;
this does not stop the independent delivery/provider jobs. Preserve incident,
change and command history and use a forward correction. The five Phase 9 live
acceptance gates remain pending until performed; local implementation does not
claim deployment, actual email or real account synchronization.
