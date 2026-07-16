# Attorney Leads — Phase 10 Firm SLA Policy and Escalation

Phase 10 replaces Phase 9's fixed reminder assumptions with one tenant-owned Attorney Lead operating policy. The policy controls internal reminder timing only; it does not change Lead lifecycle rules, Incoming Matters, external messaging, or assignment.

## Delivered

- One SLA policy per Attorney organisation and active backing firm.
- Configurable first-contact SLA from 1–168 hours.
- Configurable follow-up grace from 0–1,440 minutes.
- Validated IANA timezone.
- Configurable business days and same-day business hours.
- Quiet-hours deferral outside configured operating windows.
- Optional leadership escalation after a configurable additional delay.
- Policy-aware first-contact KPI and overdue badges in Attorney Leads.
- Leadership-managed SLA policy drawer with read-only visibility for other firm members.
- Durable, policy-versioned escalation notifications through the Phase 9 canonical notification path.

## Security and integrity

- Settings are tenant scoped with a composite Attorney firm/organisation foreign key.
- Authenticated users receive read-only table access through Lead `view_link` authority.
- All writes use a bounded security-definer command and require `manage_link` leadership authority.
- Timezone, business days, business hours, durations, payload size, and escalation leadership membership are revalidated in the database.
- The reminder sweep remains service-role only and bounded to 500 candidates.
- Notification payloads remain internal and contain no public contact details or enquiry text.

## Reminder semantics

- Follow-up reminders become due after the scheduled timestamp plus the configured grace period.
- First-contact reminders become due after the configured SLA.
- Escalations become due after the first-contact SLA plus the escalation delay.
- When quiet hours are enabled, all three wait for a configured business window.
- Policy timestamp forms part of SLA/escalation dedupe, so a materially saved policy can produce a fresh evaluation while unchanged policies remain idempotent.
- Closed, Won, Lost, or already-contacted Leads are excluded.

## Deployment gate

1. Apply migrations through `202607160009`.
2. Run `npm run verify:attorney-leads-phase10`.
3. Open **Pipeline → Leads → SLA policy** as firm leadership and save a staging policy.
4. Verify non-leadership users can inspect but cannot change the policy.
5. Exercise the reminder sweep inside and outside the configured business window.
6. Confirm grace, first-contact, and escalation timing with three isolated Leads.
7. Run the same sweep twice and confirm dedupe.
8. Confirm Incoming Matters remains unchanged.

## Deferred

- Holiday calendars and split operating windows.
- Per-branch SLA overrides.
- External email, SMS, or WhatsApp escalation.
- Workload routing and automatic assignment.
- Per-service SLA policies and quote-specific automation.
