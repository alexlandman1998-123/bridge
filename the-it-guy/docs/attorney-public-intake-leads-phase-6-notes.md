# Attorney Leads — Phase 6 Assignment and Activity

Phase 6 adds manual ownership, authored internal activity, and follow-up scheduling to the Attorney Leads CRM. It does not convert a Lead into an Incoming Matter or Matter.

## Delivered

- Assignment candidate discovery limited to active members of the same Attorney organisation.
- Manual assignment, reassignment, and return to the unassigned queue.
- Mandatory reason for reassignment or unassignment.
- Append-only assignment history with previous owner, new owner, actor, source, reason, and timestamp.
- Internal Note, Call, Email, Meeting, and WhatsApp activity types.
- Contact activity updates `first_contacted_at` and `last_contacted_at`; a New Lead moves to Contacted after genuine contact activity.
- Follow-up scheduling and clearing with activity history.
- Assignment, activity, follow-up, and status controls respect the Phase 1 role contract in the UI and the Phase 3 permission helper in the database.

## Security and consistency

- All mutations are authenticated security-definer commands with a fixed search path.
- The database rechecks the Attorney Lead, organisation, role, branch, current assignment, and target member.
- Assignment changes lock the Lead and write ownership plus both audit records atomically.
- Cross-organisation and inactive assignees are rejected even if a client manipulates the request.
- Activity types, notes, outcomes, reasons, and follow-up timestamps are bounded server-side.
- Closed Won/Lost Leads cannot receive new follow-ups.

## Architectural boundary

Incoming Matters remains the formal ARCH9 network instruction queue. Phase 6 writes only shared CRM Leads, Lead activities, and Lead assignment history. It does not create transactions, attorney instruction responses, assignments, or Matters.

## Deferred to Phase 7+

- Deliberate Lead-to-Matter conversion and lineage.
- Quote document generation or email delivery.
- Automated assignment and department queues.
- Notifications, reminder workers, SLAs, and escalation automation.
- Activity editing or deletion; history remains append-only for this release.
