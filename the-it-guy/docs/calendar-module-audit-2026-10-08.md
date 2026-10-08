# Calendar module audit

8 October 2026 · Arch9 transaction workspace

The complaints are supported by concrete faults in scheduling, reminders, cancellation, and appointment visibility. The calendar, agent profile, and dashboard read the same underlying appointments but apply different rules. Appointment dates can become inconsistent, reminders cannot reliably be saved or dispatched, and a conflict can prevent an agent from cancelling a booking.

This is a read-only audit of the current working tree and the production database, Arch9 SaaS, project isdowlnollckzvltkasn. It covers all 56 appointment records present at the production snapshot around 17:44 SAST, their attendees, reminder and notification records, database rules, background configuration, and the main agent and client workflows. The local calendar was inspected in an existing signed-in browser session without saving a booking. No production appointments were created, changed, cancelled, deleted, or emailed.

## Production findings

| Check | Result | Meaning |
| --- | --- | --- |
| Appointment records | 56; 47 not flagged as demo, 9 flagged as demo | All records were included in the inventory; demo records are identified separately. |
| Statuses | 39 requested, 9 confirmed, 3 completed, 4 cancelled, 1 Pending Confirmation | Several spellings of status coexist. |
| Appointment reminders | 0 records | The general reminder mechanism has nothing queued or recorded as sent. |
| Future active appointments | 3, all without reminders | All three are on 1 October 2027 and overlap for the same assigned agent. |
| Time consistency | 1 non-demo booking disagrees internally | An appointment on 8 October has 11:00 in start_time but 11:00 UTC in date_time, which is 13:00 SAST. |
| Overlapping bookings | 29 pairs involving 20 appointments not flagged as demo | Includes historical bookings and three pairs on 1 October 2027. This is an overlap check using saved start/end times, without adding travel buffers. |
| Appointments without attendees | 9; all flagged as demo | These should not be presented as nine broken customer bookings. |
| Future active booking without a client attendee | 1 | Its only attendee is internal; there is no client recipient for an invitation. |
| Past appointments still open | 46 including demo records; 37 excluding demo records | Old requests and confirmations remain unresolved and can obscure the next booking. |
| Attendees | 91; all have email addresses; 9 have user_id | None of their attendee-record IDs is a profiles ID. This exposes the reminder recipient-ID defect below. |
| Appointment notification log | 10 records; no email_status marked sent | Nine are marked skipped, one pending. This log does not prove that no invitation emails were delivered: 56 attendee rows have invitation_sent_at recorded. |
| General reminder automation run log | Latest recorded run: 31 July 2026, queued zero | This is not an appointment-specific delivery receipt and cannot establish functioning appointment reminders. |
| Attorney delivery | Schema and scheduled database function exist; worker absent from deployed Edge Function inventory | No appointment has attorney_delivery_enabled=true, and its delivery queue is empty. |
| Realtime publication | None of the four appointment/attendee/reminder/notification tables is published | Live database subscriptions cannot refresh these tables as currently configured. |
| Identity and organisation integrity | No orphan agent IDs, orphan attendee user IDs, or attendee organisation mismatches | These checks passed. |
| Basic time fields | No missing timestamps/date/time parts or non-positive saved durations | These checks passed. |

The [appointment inventory](/Users/alexanderlandman/the-it-guy/tmp/calendar-audit-20261008/appointment-inventory.json) contains every record, its demo flag, status, date/time, attendee count, reminder count, notification count, business-record links, and overlapping appointment IDs. Names, emails, RSVP tokens, and credentials are excluded.

The production measurements are point-in-time observations. Records not flagged as demo may still include historical testing; these counts do not establish how many real customers were affected.

## Faults requiring repair

P1 means core work can fail or persist an incorrect result. P2 means a workflow or capability is incomplete or gives misleading information. Runtime findings below were reproduced against current source functions; they do not assert that every production frontend is running that exact source revision.

### F01 Editing a booking can preserve the old timestamp

**P1 · Reproduced**

The update merges the current appointment with the new date and time. Normalization then prefers the old dateTime over those new fields. Moving a booking from 1 October at 11:30 to 2 October at 15:00 produces new date/time fields while retaining the old UTC timestamp. Readers using different fields consequently disagree; reminder calculations can use the old timestamp.

One production booking already has inconsistent fields, although its historical cause cannot be established from this snapshot.

Repair: derive a single authoritative instant from the changed date, time, and timezone; validate consistency before saving and reconcile existing mismatches.

Evidence: [normalization](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:1627), [update merge](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:2806).

### F02 Scheduling depends on the computer timezone

**P1 · Reproduced in SAST and UTC**

The primary save and availability helpers construct local JavaScript dates without applying the appointment timezone. A booking labelled Africa/Johannesburg at 11:30 saves correctly on a SAST computer, but becomes 11:30 UTC on a UTC computer, two hours late. Availability can also turn a saved 30-minute appointment into a 150-minute busy period.

Repair: use explicit timezone conversion throughout creation, editing, availability, reminders, and exports; use the existing SAST helpers consistently.

Evidence: [date derivation](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:1577), [availability date parsing](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/appointmentAvailabilityEngine.js:69).

### F03 Pending bookings do not reliably prevent double booking

**P1 · Reproduced and production overlaps observed**

The availability engine treats confirmed and the legacy text Pending Confirmation as busy, but ignores canonical requested, accepted, alternative_requested, and alternative_proposed. Booking the same agent at the same time is therefore allowed against some pending bookings and blocked against others.

The general agent path also checks then saves in separate requests. The production schema has no general exclusion constraint, and the inspected server slot guard is conditional on attorney/resource involvement. Two simultaneous agent saves need authoritative conflict enforcement at the database boundary.

Repair: define which lifecycle states reserve the slot, normalize them once, and enforce participant/owner/resource conflicts atomically.

Evidence: [active status rules](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/appointmentAvailabilityEngine.js:3), [scheduling precheck](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:2261), production overlap inventory.

### F04 Attendees disappear from the authoritative scheduling precheck

**P1 · Reproduced**

The scheduling service normalizes the proposed appointment before checking it. That normalizer does not retain participants, so the check receives an empty attendee list. The assigned agent may still be checked, but another attending agent, client, attorney, or other participant can be double booked.

Repair: retain participant identities through the complete precheck and save path, using stable user/contact IDs as well as email.

Evidence: [normalization output](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:1627), [participants passed to conflict check](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:2274).

### F05 A scheduling conflict can block cancellation or completion

**P1 · Reproduced**

The ordinary update service runs availability checking even when the action is cancellation or completion. The conflict engine checks the candidate against other bookings without exempting a terminal candidate. An overlapping confirmed booking can therefore prevent cancellation of the booking the agent is trying to remove.

Repair: allow terminal transitions without reserving a slot; release the slot and stop pending work in the same operation.

Evidence: [update conflict check](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:2840), [conflict engine](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/appointmentAvailabilityEngine.js:470).

### F06 Reschedule and no-show statuses are reset to requested

**P1 · Reproduced**

The legacy status mapper recognizes human-readable labels but fails to preserve canonical alternative_requested, alternative_proposed, and no_show. Each becomes requested. Saving these states through the general service can erase their meaning and produce incorrect dashboard labels, notifications, and workflow decisions.

Repair: make every valid canonical status round-trip unchanged and validate allowed transitions.

Evidence: [status mapper](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:1521).

### F07 Reminder and notification recipients use the wrong identity

**P1 · Reproduced source behavior and production schema confirmed**

The general service puts participantId into recipient_id for reminders and notification events. Both production recipient_id columns reference profiles(id), not appointment_participants(participant_id). None of the 91 production participant IDs matches a profiles ID.

The missing-table detector also accepts any error message containing the table name. A foreign-key error naming appointment_reminders can consequently be treated as a missing table and return an empty result. The analogous notification error can lose the delivery record while email sending continues.

Repair: distinguish the attendee identity from an optional registered user's profile ID. External clients need email/contact delivery without a fabricated profile ID. Only actual missing-table errors should take the compatibility path.

Evidence: [reminder recipient](/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/appointmentNotificationService.js:615), [notification recipient](/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/appointmentNotificationService.js:813), [error classifier](/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/appointmentNotificationService.js:70), production foreign-key inspection.

### F08 The general reminder queue has no automatic dispatcher

**P1 · Configuration and source gap**

The general appointment service has reminder scheduling and status-update functions, but no inspected worker consumes due appointment_reminders. No relevant production cron job or application cron points to such a consumer. The listing-viewing worker delivers its separate viewing events; the attorney worker uses a separate durable queue. The generic notification reminder dispatcher does not supply the missing appointment_reminders consumer.

Repair: a server worker must claim due reminders, check the current appointment revision/state, deliver, record receipts, and retry safely while the agent is offline.

Evidence: [reminder service](/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/appointmentNotificationService.js:976), [application cron configuration](/Users/alexanderlandman/the-it-guy/the-it-guy/vercel.json:21), production cron/function inventory.

### F09 Invitation and reminder setup depends on the browser staying alive

**P1 · Source-confirmed failure path**

Ordinary creation saves the booking and then performs notification/reminder work. The background option uses an unawaited browser task; calling it queued does not persist a delivery job. Closing or refreshing the page can interrupt work after the appointment has saved. A successful invite and failed reminder setup can also leave a partial result.

Repair: save durable delivery jobs with the appointment and return separate booking and delivery receipts. Use the existing attorney durable-delivery design as a reference.

Evidence: [background side effects](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:2715), [notification/reminder sequence](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:2436).

### F10 Editing attendees replaces identities and can leave a partial booking

**P1 · Source-confirmed failure path**

Participant replacement deletes every attendee and reinserts the list in separate database calls. The insert mapper does not supply participant_id, so new database IDs are generated, even for existing attendees. The editor also omits user/contact linkage and some RSVP history fields when copying attendees. If insertion fails, the appointment can remain saved with its participants removed.

Repair: atomically create/update/delete participants while preserving existing identity, response history, tokens, user/contact linkage, and delivery history.

Evidence: [participant replacement](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:2120), [insert mapper](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:1917), [editor participant copy](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/agency/AgencyPipelinePage.jsx:24149).

### F11 Agent profiles and dashboards disagree about shared appointments

**P1 · Reproduced**

The dashboard matches assignment, creator, and attending participants. The profile command centre matches row-level ownership/creator fields but ignores attendees. A booking owned and created by Agent B, attended by Agent A, appears on A's dashboard and disappears from A's profile calendar. The directory grouping uses another assignment-only rule.

Repair: agree on one visibility contract for assigned agent, creator, co-agent, participant, and lead owner, then reuse it across readers and summaries.

Evidence: [dashboard identity](/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/appointmentDashboardService.js:249), [profile identity](/Users/alexanderlandman/the-it-guy/the-it-guy/src/modules/agency/agents/principalAgentCommandCentreService.js:450), [directory grouping](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/Agents.jsx:1502).

### F12 Failed reads can appear as no appointments

**P1 · Source-confirmed failure path**

Agent performance loading catches appointment-read failures and substitutes an empty array. Profile components can then show No appointments scheduled, making a failed read indistinguishable from a genuinely empty calendar. Some dashboard variants also combine an error message with an empty-state message.

Repair: retain the last verified snapshot, show an unavailable state and Retry, and keep counts unknown until the read succeeds.

Evidence: [empty fallback](/Users/alexanderlandman/the-it-guy/the-it-guy/src/modules/agency/agents/agentPerformanceDataService.js:101), [dashboard load/error states](/Users/alexanderlandman/the-it-guy/the-it-guy/src/components/appointments/dashboard/AppointmentDashboardSection.jsx:802).

### F13 Appointment updates do not consistently refresh other screens

**P1 · Source and production configuration confirmed**

Saves emit itg:agency-crm-updated in the current window. The agent directory listens for a different directory event; the profile and mobile calendar lack equivalent appointment-change reconciliation. Dashboard appointment widgets refresh from props/keys, including a key based on row count, which cannot detect every same-count edit or cancellation. None of the relevant tables is in production's realtime publication.

Repair: invalidate affected views on appointment revisions, reconcile on focus, and provide a reliable server-change mechanism or bounded polling across users/devices.

Evidence: [save event](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:980), [directory listener](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/Agents.jsx:6120), [profile load](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/Agents.jsx:7499), [mobile load](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/mobile/MobileCalendarPage.jsx:17), [dashboard refresh key](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/Dashboard.jsx:5273).

### F14 Next appointment and profile counts use inconsistent lifecycle rules

**P2 · Reproduced**

The dashboard sorts all bookings and chooses the first nonterminal booking as Next Appointment, even if it is months overdue. The profile includes completed bookings with future dates in upcoming because its exclusion helper does not exclude completed. Profile date boundaries also use the computer timezone, while the dashboard has explicit SAST helpers.

Repair: separate overdue work from the next future appointment and use shared lifecycle/date rules for all counts.

Evidence: [next appointment selection](/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/appointmentDashboardService.js:450), [profile filtering](/Users/alexanderlandman/the-it-guy/the-it-guy/src/modules/agency/agents/principalAgentCommandCentreService.js:827).

### F15 The main calendar creates a viewing against an implicit lead

**P1 · Browser observed and source confirmed**

Clicking Appointment on the general calendar opened Schedule viewing with an already selected buyer lead. The handler defaults to viewing, uses selectedLead to seed business links, and creation gives that lead's assigned agent precedence over the chosen calendar agent. The appointment-type selector is hidden whenever a type is already populated, so this path does not offer a general appointment chooser.

Repair: general calendar creation needs an explicit appointment type, owner, and optional related record. Lead-specific scheduling should carry its context intentionally and visibly.

Evidence: [calendar create action](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/agency/AgencyPipelinePage.jsx:33006), [default/context handling](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/agency/AgencyPipelinePage.jsx:24091), [owner precedence](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/agency/AgencyPipelinePage.jsx:23638), [hidden type selector](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/agency/AgencyPipelinePage.jsx:41967).

### F16 Cancellation does not provide archive or removal

**P2 · Missing agent capability**

The general service exposes cancellation but no user-facing appointment delete/archive workflow. Cancelled records remain history; the agent cannot reliably remove an accidental or duplicate booking from their working calendar. Failed optimistic cancellation relies on a later reload to reconcile the locally changed state.

Repair: cancellation should immediately disappear from active schedules while remaining in history. Provide reversible archive/hide for terminal records and an explicit audited deletion policy for mistaken drafts/duplicates.

Evidence: [cancellation action](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/agency/AgencyPipelinePage.jsx:32152), service/action inventory.

### F17 External calendar links do not provide synchronization

**P2 · Explicitly unimplemented**

Google sync, Outlook sync, external event update, and external event deletion all throw not implemented. Google/Outlook links and ICS downloads are manual copies. Cancelling or moving a booking in Arch9 cannot automatically reconcile those manually copied events through the available provider functions.

Repair: distinguish Add to calendar from Connected calendar sync. If connected sync is required, implement authenticated provider links, stable event IDs, revision updates/cancellations, and visible errors.

Evidence: [provider placeholders](/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/appointmentCalendarInviteService.js:477), [current controls](/Users/alexanderlandman/the-it-guy/the-it-guy/src/components/appointments/AppointmentCalendarActions.jsx:75).

### F18 Reminder settings and lifecycle changes are incomplete

**P2 · Custom-rule failure reproduced; remaining paths source-confirmed**

Custom reminderRules are not persisted by the general appointment mapper, and reminder generation reads type defaults rather than the booking's rules. A custom 30-minute reminder becomes the default 24-hour/two-hour/at-start schedule. Timing updates add new reminders without consistently retiring old ones; some confirmation/request branches return before scheduling replacement reminders. Reminder setup is tied to the invitation option at creation, and that choice is not persisted as a durable booking preference.

Repair: persist separate invite/reminder preferences, honor the saved rule, supersede work after any material change, exclude declined/removed attendees, and define the behavior for bookings made inside a reminder window.

Evidence: [default-only reminder generation](/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/appointmentNotificationService.js:577), [save mapper](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:1858), [update branches](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:3023).

### F19 General invitation updates lack reliable calendar revision handling

**P2 · Source-confirmed capability gap**

The general email payload does not carry calendarSequence, while the email attachment defaults its SEQUENCE to zero. The attachment also interprets the supplied date/time as SAST regardless of the declared timezone. This limits reliable handling of edits/cancellations in external calendar clients and needs explicit all-day/timezone acceptance tests. The attorney queue does have a separate revision mechanism.

Repair: use one stable calendar UID, increasing revision, consistent timezone/all-day representation, and the correct request/cancel method across email and download paths.

Evidence: [general email payload](/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/appointmentNotificationService.js:409), [attachment generation](/Users/alexanderlandman/the-it-guy/supabase/functions/send-email/handlers/appointment.ts:39).

### F20 Attorney delivery is installed only in part

**P1 for attorney delivery · Production configuration confirmed**

Production has the durable-delivery schema and scheduled database function, but the deployed Edge Function inventory does not include attorney-appointment-delivery-worker. No current booking opts into that queue. Passing local tests does not establish deployed attorney invitation/reminder delivery.

Repair: verify the intended rollout, worker deployment and environment, scheduling invocation, job receipts, and one authorized controlled delivery. An active cron entry alone is insufficient.

Evidence: production Edge Function inventory; [worker](/Users/alexanderlandman/the-it-guy/supabase/functions/attorney-appointment-delivery-worker/index.ts:1), [schedule](/Users/alexanderlandman/the-it-guy/supabase/migrations/20261003204821_attorney_calendar_delivery_worker_schedule.sql:1).

### F21 The general save path cannot prove every mutation succeeded

**P1 · Source-confirmed failure path**

The ordinary appointment update checks for an error but does not request or validate an affected row. An RLS-filtered zero-row update can look successful before a reload returns the old state. Linked checklist/event writes also rely on catches even though Supabase can return errors rather than throw. An appointment may therefore appear completed while its linked task remains incomplete.

Repair: validate mutation receipts and perform required appointment, participant, reminder, and workflow changes atomically. Optional timeline failures need a visible recoverable warning.

Evidence: [appointment mutation](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:2862), [linked task write](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/agencyPipelineService.js:2918).

## Scenario coverage and acceptance checklist

These are the scenarios the calendar must pass before it is considered reliable. Reproduced means the actual current source functions were exercised locally. Source gap means the path was inspected but no customer-data mutation was attempted. Existing tests cover some flows with fixtures; that is different from verified production delivery.

| Agent or client scenario | Audit result | Required behavior |
| --- | --- | --- |
| New booking from the general calendar | Browser/source gap F15 | Choose any supported type, agent and optional related record explicitly. |
| Booking from a buyer lead | Partially covered by current code/tests | Correct lead/client/listing linkage; receipt visible after save. |
| Seller valuation and presentation | Source contracts partly stale | Correct type and completion effect; attendees and reminders optional independently. |
| Principal schedules for another agent | Source gap F15 | Chosen agent remains owner unless an explicit reassignment is made. |
| Co-agent attends someone else's booking | Reproduced F11 | Same booking visible in calendar, profile and dashboard. |
| Lead owner sees booking assigned elsewhere | Existing lead-reader tests pass | Visibility preserved with appropriate permissions. |
| Navigate to a far-future date | Existing range tests pass | Load that visible range, including 1 October 2027. |
| Date near SAST midnight | Existing dashboard/mobile tests pass | Correct SAST day grouping on those readers. |
| Booking from a computer set to UTC | Reproduced F02 | Same intended SAST instant and duration. |
| Edit date or start time | Reproduced F01 | Every view, invitation, reminder and conflict check moves together. |
| Edit duration | Timezone probe plus existing attorney tests | Saved duration drives busy time and exports everywhere. |
| Concurrent bookings for the same agent | Source gap F03 | Database rejects the losing conflicting save. |
| Overlap an existing pending request | Reproduced F03 | Apply the agreed slot-reservation rule consistently. |
| Same client or second agent in two bookings | Reproduced F04 | Participant identities participate in conflict enforcement. |
| Back-to-back bookings with travel buffer | Engine has buffer support | Display a useful warning and apply an agreed travel rule. |
| Evening or weekend viewing | Allowed by current engine | Property appointments remain possible; preferences guide suggestions. |
| Room/resource clash | Existing attorney fixture checks pass | Correct organisation/resource; atomic protection. |
| Cancel a conflicting booking | Reproduced F05 | Cancellation succeeds and releases the slot. |
| Cancel a booking with reminders queued | Source gaps F08/F18 | Pending reminders and obsolete invites are superseded. |
| Hide an accidental/cancelled duplicate | Missing F16 | Archive/hide with recoverable history and clear permissions. |
| Complete a booking and its linked task | Source gap F21 | Both succeed, or the failure is clearly recoverable. |
| Record a no-show | Reproduced F06 | Preserve no_show and exclude it from upcoming work. |
| Client accepts or declines invitation | Existing response database scenarios pass | Validate token, allowed transition, current revision and role. |
| Client proposes a new time | Existing attorney tests; general gap F06 | Preserve proposed state until the agreed confirmation flow completes. |
| Repeated, expired or revoked RSVP link | Existing response/attorney fixtures | Idempotent response; stale token denied clearly. |
| Edit attendee details after RSVP | Source gap F10 | Preserve identity/response history and intentionally rotate access when needed. |
| Remove a participant | Source gaps F10/F18 | Revoke their access and stop future delivery to them. |
| Create booking and immediately close the page | Source gap F09 | Durable server work completes independently. |
| Automatic 24-hour/two-hour reminders | Production/source gap F07/F08 | Valid recipient, claimed job, provider receipt and retry. |
| Custom 30-minute reminder | Reproduced F18 | Saved per-booking preference is honored. |
| Booking created less than two hours ahead | Source gap | Defined catch-up behavior; no obsolete reminder burst. |
| Invitation disabled but reminders desired | Source gap F18 | Separate saved preferences. |
| Client without an Arch9 login | Identity gap F07 | Deliver by email/contact without requiring a profile. |
| Provider failure or temporary outage | Partial retry infrastructure | No false sent status; retry and visible delivery failure. |
| Open profile/dashboard while another device edits | Source/config gap F13 | Reliable refresh without navigating away. |
| Network failure while loading | Source gap F12 | Show unavailable, retain valid data, offer Retry. |
| Months-old unanswered request | Reproduced F14 | Appears in overdue work, not as the next future appointment. |
| Completed record with future date | Reproduced F14 | Excluded from upcoming counts. |
| Download/add to external calendar | Existing local export tests pass | Explicit manual-add behavior with correct dates and duration. |
| Automatic Google/Outlook update/cancellation | Missing F17 | Either implement connected sync or clearly disclose manual copies. |
| Use calendar on a phone | Existing reader tests pass; capability gap | Open details and create/edit/cancel/respond from mobile. |
| Unrelated user or organisation accesses a booking | Rules inspected; no live impersonation | Explicit ownership/participant/manager access; negative tests on real RLS. |

The mobile calendar currently renders appointments as static cards with no detail/open/create/edit/cancel action. It also needs refresh on returning to the app. This is a missing working capability even though its display tests pass.

## Minimum functionality an agent needs

The first repair should make the existing calendar reliable before expanding it:

1. Create a standalone appointment or one explicitly linked to a lead, listing or transaction, with an intentional type, owner, participants, venue and date.
2. See the same booking, time, status and ownership in calendar, profile, dashboard, lead/listing history and mobile.
3. Edit and reschedule without losing attendees, RSVP history or links; detect conflicts for every required participant.
4. Cancel, complete or mark no-show reliably; archive mistakes while retaining a useful history.
5. Configure invitations and reminders separately, see who received them, retry failures and know whether client confirmation is outstanding.
6. Receive automatic reminders while the agent is offline; suppress obsolete or cancelled work.
7. Open the actual appointment from summary cards, rather than landing on an unselected calendar.
8. Manage appointments on mobile.
9. Understand whether an external calendar is a manual copy or a connected calendar.

Recurring appointments, personal unavailable periods, richer travel-time planning, bulk actions and calendar subscriptions are useful later enhancements. Their design should follow the repaired ownership, timezone, status and delivery contracts.

## Verification results

- 119 tests passed in the existing attorney calendar Vitest suite, including local database fixtures for management, delivery jobs, tokens, rescheduling and exports.
- 28 tests passed for the agent appointment hook, lead history reader, mobile calendar reader, agent-source loading and overview.
- Three Deno tests passed for worker authorization and generic reminder email templates. These use fixtures and send no emails.
- Twelve of fourteen focused Node script checks passed. The RSVP contract included 17 local response database scenarios.
- Two source-text checks failed: appointment-phase1-stop-bad-appointments and seller-lead-appointments-workspace-simplified. Their assertions expect old source shapes: direct attorney insertion and a direct completion onClick. Current code uses an atomic attorney RPC and an action wrapper. These checks need updating; their failures are not evidence that those two operations failed at runtime.
- Twenty-one additional complaint-focused probes ran against actual source functions. Sixteen exposed defects/gaps under SAST; eighteen under UTC, including the two timezone-specific failures. These deliberately include valid control scenarios.
- The signed-in local calendar and unsaved create form were inspected. Its current workspace showed no appointments for the visible week; this is not proof that another organisation's bookings are absent.
- Production reads inspected all appointment records, attendees, foreign keys, status constraints, triggers, RLS rules, job configuration, deployed worker inventory and realtime publication.

This was not a build or release certification. No app implementation changed. A full production create → email → reminder → RSVP → edit → cancel test requires explicitly authorized controlled appointments and recipients. Real Google/Outlook behavior and negative role tests also remain to be verified in that controlled environment.

Reproducible evidence:

- [SAST probes](/Users/alexanderlandman/the-it-guy/tmp/calendar-audit-20261008/probes-sast.json)
- [UTC probes](/Users/alexanderlandman/the-it-guy/tmp/calendar-audit-20261008/probes-utc.json)
- [Probe runner](/Users/alexanderlandman/the-it-guy/tmp/calendar-audit-20261008/probes.mjs)
- [Production integrity evidence](/Users/alexanderlandman/the-it-guy/tmp/calendar-audit-20261008/production-evidence.json)
- [Production delivery evidence](/Users/alexanderlandman/the-it-guy/tmp/calendar-audit-20261008/production-delivery-evidence.json)
- [Existing script check results](/Users/alexanderlandman/the-it-guy/tmp/calendar-audit-20261008/contract-results.json)
- [Attorney suite log](/Users/alexanderlandman/the-it-guy/tmp/calendar-audit-20261008/vitest-attorney.log)
- [Agent suite log](/Users/alexanderlandman/the-it-guy/tmp/calendar-audit-20261008/vitest-agent.log)

## Repair order and definition of done

**First: booking integrity.** Fix timestamp derivation, timezone conversion, canonical statuses, attendee retention, conflict enforcement and terminal actions. Existing data inconsistencies should be reviewed before an authorized repair; do not silently guess which conflicting time was intended.

**Second: durable delivery.** Fix recipient IDs and error classification, persist invitation/reminder preferences, save jobs atomically, implement the general reminder worker and supersede outdated jobs. Complete the intended attorney worker rollout with verified receipts.

**Third: consistent visibility.** Share ownership/status/count rules, remove silent-empty fallbacks, refresh every consuming screen, separate overdue work and provide direct links to booking details.

**Fourth: finish the agent workflow.** Correct standalone creation, add archive/history controls and mobile actions, then decide whether true external calendar sync belongs in scope.

Done means one controlled booking can be created, displayed consistently everywhere, invited and reminded automatically, accepted or rescheduled, edited without contradictory times, cancelled without conflict blockage, and removed from active work while its history remains available. It must also pass network-failure, concurrent-save, stale-response, wrong-role and wrong-organisation scenarios.

The audit artifacts are the only changes made for this task. Repairing application code, correcting production records, sending controlled test emails, and deploying workers are separate next actions.

