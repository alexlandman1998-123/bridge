# Attorney Leads — Phase 9 Notifications and SLA

Phase 9 adds internal operational signals to the Attorney Lead lifecycle. It reuses the platform notification automation ledger and existing in-app notification bell; it does not create a parallel notification store.

## Delivered

- A deduplicated notification when an Attorney Lead is created.
- A deduplicated notification to the new owner when a Lead is assigned or reassigned.
- An idempotent service-role reminder sweep for due follow-ups.
- A 24-hour first-contact SLA reminder for open Leads that remain New and uncontacted.
- Leadership fallback when a new public Lead is unassigned.
- Durable `notification_events` audit entries linked to the Lead and tenant.
- In-app notifications that navigate directly to `/attorney/leads`.
- First-contact SLA KPI, attention filter, and overdue badges in the Leads workspace.

## Safety boundaries

- Reminder generation is service-role only and bounded to 1–500 candidates per run.
- Dedupe keys prevent repeat alerts for the same creation, assignment, follow-up timestamp, or first-contact breach.
- Closed, Won, and Lost Leads are excluded from reminders.
- A changed follow-up timestamp is a new reminder contract; an unchanged timestamp is not repeated.
- Notification payloads contain Lead identifiers and routing metadata, not public contact details or enquiry messages.
- Public submit remains successful even when no internal recipient can be resolved; the Lead remains the source of truth.
- No email, SMS, WhatsApp, marketing sequence, customer notification, or automatic assignment is added.
- Incoming Matters is unchanged.

## Scheduling

The database command is:

`bridge_queue_attorney_lead_follow_up_reminders(limit, checked_at)`

Invoke it from the existing trusted scheduler with the service role every 15 minutes. Start with a low batch limit in staging, verify dedupe and recipient routing, then raise the limit up to 500 if required. Do not invoke it from a browser or expose it through an anonymous Edge Function.

## Deployment gate

1. Apply migrations through `202607160008`.
2. Run `npm run verify:attorney-leads-phase9`.
3. Create one unassigned public Lead and confirm leadership receives one notification.
4. Assign it and confirm only the new owner receives the assignment notification.
5. Set a past follow-up, run the service-role sweep twice, and confirm only one reminder exists.
6. Verify the notification opens Attorney Leads and can be marked read.
7. Confirm no Incoming Matters row or transaction was created.

## Deferred

- External email and WhatsApp delivery.
- Per-firm SLA configuration and quiet hours.
- Escalation chains and workload-based assignment.
- Quote reminders and marketing nurture campaigns.
- Customer-facing acknowledgement messages.
