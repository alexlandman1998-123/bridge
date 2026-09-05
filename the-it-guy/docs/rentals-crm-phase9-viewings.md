# Rentals CRM Phase 9 — Viewing Handoff and Outcomes

Phase 9 joins the tenant lead workflow to the existing rental viewing activity store.

- Only a `Qualified` tenant lead may be scheduled for a viewing.
- A successful schedule records a listing activity and advances the lead to `Viewing scheduled` with timestamped workflow evidence.
- Outcomes are recorded against the scheduled viewing. Only `Attended` advances the lead to `Viewing completed`; no-shows, cancellations and reschedule requests remain operational records without a false pipeline advance.

Scheduling and outcome storage are separate writes. If a stage update fails after an operational viewing write, the user is shown the failure rather than the system silently claiming both succeeded.
