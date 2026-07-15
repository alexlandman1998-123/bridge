# OTP Phase 10 — Closed-loop review resolution

Phase 10 answers the question Phase 9 intentionally leaves open: did notifying someone actually resolve the governed OTP finding?

## Resolution rules

A notification being read is acknowledgement, not legal or operational resolution.

An item is marked **resolved after notification** only when its packet/version/state action is absent from a newly generated Phase 8 audit. The resolution check refreshes Phase 8 every time; it never relies on the audit that originally produced the notification plan.

Current findings are classified as:

- **Notification missing** — the finding is routable but no matching Phase 9 delivery evidence exists.
- **Awaiting acknowledgement** — at least one assigned reviewer has not read the notification and its SLA has not expired.
- **Overdue unread** — an unread notification exceeded its priority SLA.
- **Acknowledged, unresolved** — assigned reviewers read the notification but the underlying finding remains.
- **Unroutable** — the packet has no transaction from which assigned roles can be resolved.
- **Resolved after notification** — the previously notified finding no longer exists in the fresh audit.

Critical follow-up uses a 2-hour acknowledgement SLA, high priority uses 24 hours, and normal priority uses 48 hours. These SLAs measure acknowledgement only; the finding remains open until the underlying evidence is repaired.

## Operator journey

After running Phase 8 or applying a Phase 9 plan, an organisation administrator can choose **Check follow-up status** in the OTP overview. The read-only report shows:

- active findings;
- missing outreach;
- overdue unread items;
- acknowledged but unresolved items;
- resolved items; and
- the current closure gate.

Resolved historical notifications can be expanded separately from active work.

## Safety

The query is organisation-scoped through the current OTP transactions and reads only Phase 9 dedupe keys. Partial Phase 8 or notification queries make the closure gate incomplete. The report never marks notifications read, sends reminders, approves wording, clears review items, releases signing or rolls back a template.

## Verification

```bash
npm run test:otp-closure-phase10
```

The suite covers missing outreach, acknowledgement without resolution, priority SLA expiry, genuine resolution, unroutable findings and incomplete evidence, then runs the Phase 9 and Phase 8 regressions.
