# Attorney Leads — Phase 13 Transactional Quote Email Delivery

Phase 13 delivers sent Attorney Lead quotes by transactional email through the existing Resend and `communication_deliveries` infrastructure. It does not introduce a second email ledger or allow the browser to supply a recipient or bearer token.

## Delivered

- **Email client** and **Resend email** actions on sent quotes.
- Branded HTML and plain-text email containing the quote number, fee breakdown, total, validity date, security notice, and secure decision link.
- Firm contact details and reply-to address from server-resolved Attorney firm data.
- Server-resolved recipient from the canonical Lead Contact.
- Fresh secure quote link for every intentional delivery attempt.
- Sent or failed status, attempt count, last sent time, canonical delivery ID, provider message ID, and Lead activity history.
- CRM-visible delivery status without exposing provider internals.

## Delivery architecture

1. The authenticated browser sends only `organisationId` and `quoteId` to the existing JWT-protected `send-email` function.
2. A user-scoped database command rechecks Attorney Lead edit authority and resolves the Contact, firm, quote, and fresh Phase 12 token.
3. The handler builds the public URL only from configured application URL secrets.
4. The existing delivery service writes a prepared `communication_deliveries` row.
5. Resend receives the branded HTML and equivalent plain text.
6. The canonical delivery becomes sent or failed and the quote-link snapshot and Lead activity are updated through a service-role-only command.

The browser never supplies the recipient email, recipient name, firm identity, quote amounts, public origin, or bearer token.

## Idempotency and failure handling

- Parent-first Lead and quote locks serialize preparation.
- A dispatch reservation blocks concurrent sends for ten minutes while a delivery is in progress.
- A thirty-second post-send guard prevents accidental immediate duplicates.
- A stale reservation can be replaced after ten minutes.
- A retry creates a fresh bearer link and atomically revokes the prior active link.
- Provider failure records canonical failed telemetry and revokes the newly created link.
- Missing or invalid Contact email fails before Resend is called and rolls back link preparation in the same database transaction.

## Product boundary

- Email delivery is transactional, not marketing automation.
- Emailing or accepting a quote never creates a Matter, transaction, assignment, mandate, or Incoming Instruction.
- Public quote acceptance still marks only the Lead Won.
- The separate confirmed **Convert to Matter** command remains the sole firm-originated operational conversion path.

## Deployment gate

1. Apply migrations through `202607160018`.
2. Deploy the updated `send-email` function with `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `PUBLIC_APP_URL` or `CLIENT_APP_URL` configured.
3. Run `npm run verify:attorney-leads-phase13`.
4. Send a staging quote to a controlled inbox and verify HTML, plain-text fallback, branding, fee values, reply-to, and URL host.
5. Confirm the delivery row moves from prepared to sent and the Lead records **Quote Email Sent**.
6. Double-submit and confirm the dispatch reservation prevents duplicate delivery.
7. Resend after the guard window and confirm the previous link is revoked.
8. Force a provider failure and confirm failed telemetry plus link revocation.
9. Remove the Lead email and confirm the command fails without calling Resend.
10. Accept from the delivered link and verify no Matter or Incoming Instruction is created.

## Deferred

- Resend webhook processing for delivered, bounced, complained, and suppressed states.
- Email open/click analytics.
- SMS and WhatsApp delivery.
- Branded PDF attachment generation.
- Automated reminders and scheduled quote follow-ups.
