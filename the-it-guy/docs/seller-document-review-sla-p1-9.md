# Seller document review SLA — P1-9

P1-9 prevents uploaded seller documents from remaining indefinitely in the review queue.

## SLA policy

- Upload creates a new SLA revision and a review deadline 48 hours later.
- At 24 hours, the assigned agent receives an in-app warning.
- At 48 hours, the review is breached and escalated.
- At 96 hours, the review becomes critical and is surfaced for agency administration.
- A review without an assigned agent is critical immediately.
- Approval, rejection, completion, or non-applicability resolves the SLA and closes queued alerts.
- Alert delivery failures remain visible as blocking exceptions in the SLA view.

Every alert uses `document + SLA revision + level` deduplication, so repeated monitor runs are safe. A replacement upload starts a new SLA revision.

## Automatic execution

The existing notification-reminder dispatch heartbeat calls `bridge_refresh_seller_document_review_sla_p1_9` before processing due reminders. P1-9 therefore advances with time even when nobody opens the listing workspace.

Deploy both migration `202607170014_seller_document_review_sla_p1_9.sql` and the updated `send-email` function. If the function has not yet been deployed, operations can run a scoped refresh manually:

```bash
npm run audit:seller-document-review-sla
npm run refresh:seller-document-review-sla -- --organisation-id=<uuid> --confirm-refresh
```

The audit command is dry-run by default. A manual mutating refresh requires an organisation or listing scope plus explicit confirmation.

## Release gate

Critical, unassigned, or failed-notification reviews block release readiness. Due-soon and breached reviews produce a warning. The listing workspace uses the same report model as the operator audit.
