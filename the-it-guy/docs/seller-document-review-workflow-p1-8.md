# Seller document review workflow — P1-8

P1-8 turns the P1-7 review queue into an auditable operational workflow.

## Review contract

Agents and organisation administrators can start review, approve, or reject an uploaded seller document. Each command:

- locks the document and exact linked requirement;
- checks the caller is the assigned agent, listing creator, or organisation administrator;
- rejects stale decisions using `review_revision` optimistic concurrency;
- permits decisions only from `uploaded` or `under_review`;
- requires a seller-readable rejection reason of at least five characters;
- records reviewer, timestamps, reason, before/after status, revision, and an immutable review event;
- writes seller-visible listing activity for final outcomes;
- queues the review outcome notification;
- relies on P0-3 to reopen rejected-document requests and P0-4/P0-6 to update assurance and transaction continuity.

An upload cannot be approved unless it has a listing-scoped `requirement_id`. This prevents a general file from satisfying the wrong checklist item.

## Manual reminder contract

The agent can send a reminder only for a required requirement in `required`, `requested`, or `rejected` state. The command refuses to send when a file already awaits review and deduplicates reminders by requirement revision and calendar day.

## Queue SLA

`seller_document_review_queue_v1` exposes pending review age and marks an uploaded/under-review file overdue after 48 hours. The view uses invoker security so the underlying listing RLS remains authoritative.

## Deployment and verification

Deploy migration `202607170013_seller_document_review_workflow_p1_8.sql` before enabling the UI actions in production.

```bash
npm run test:seller-document-review-p1-8
npm run verify:seller-document-automation
```
