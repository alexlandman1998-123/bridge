# Attorney Leads — Phase 12 Secure Public Quote Decisions

Phase 12 turns a sent Attorney Lead quote into an optional, branded client decision experience. It introduces a dedicated bearer-link aggregate and anonymous Edge boundary without exposing Lead, quote, Contact, firm, or organisation identifiers.

## Delivered

- Secure public route at `/quote/:token`.
- Mobile-first branded quote view with firm logo, colours, contact details, fee breakdown, total, quote number, version, and validity date.
- Explicit public acceptance and reasoned decline actions.
- Staff controls to issue, reissue, copy, inspect, and revoke a client link from the Lead quote register.
- One active link per quote; reissuing atomically revokes the prior link.
- Reload-safe decided states after acceptance or decline.
- Public decision activity recorded in the existing Lead history.

## Token and access security

- Tokens contain 256 bits of database-generated randomness.
- The raw token is returned once and is never persisted.
- Only a lowercase SHA-256 token hash is stored.
- Anonymous browsers cannot query quote, Lead, Contact, link, or organisation tables.
- Public resolution and decision commands require `service_role` and are reachable only through the narrow Edge Function.
- The Edge Function bounds request size, validates tokens and decisions, disables caching, denies framing, and returns neutral unavailable responses.
- Resolver output is a fixed presentation-safe shape with no internal IDs or internal quote notes.

## Decision semantics

- Only a sent, unexpired quote on an open, unconverted Attorney Lead can be shared or decided.
- Acceptance marks the quote accepted and the Lead Won.
- Decline requires a reason, marks the quote declined, and leaves the Lead open for another version.
- Repeated identical submissions are idempotent.
- Revoked, expired, superseded, internally decided, converted, or closed links cannot make a new decision.
- Every internal sent-to-terminal quote transition revokes active link metadata atomically.
- Parent-first row locking serializes internal actions, public decisions, reissues, and revocations.
- A public decision never creates a Matter, transaction, assignment, or Incoming Instruction.
- Acceptance is explicitly not an attorney-client mandate; the existing confirmed Convert to Matter command remains separate.

## Deployment gate

1. Apply migrations through `202607160011`.
2. Deploy the `attorney-quote-decision` Edge Function with JWT verification disabled as configured.
3. Run `npm run verify:attorney-leads-phase12`.
4. Create and send a staging quote, then issue its client link.
5. Verify the public page exposes no internal IDs or internal note.
6. Reissue the link and verify the earlier token becomes unavailable.
7. Decline through the public page and verify the reason and Lead activity while the Lead remains open.
8. Send a fresh version, accept publicly, and verify the Lead becomes Won with no Matter or Incoming Instruction.
9. Repeat the same decision request and verify idempotency.
10. Verify expired, revoked, cross-tenant, malformed, and internally decided links cannot mutate state.

## Deferred

- Email, SMS, and WhatsApp delivery with delivery telemetry.
- Branded PDF generation and downloadable formal fee documents.
- Electronic mandate or engagement-letter signature.
- Public identity verification beyond possession of the bearer link.
- Quote reminders, automatic expiry sweeps, analytics, approval thresholds, and deposits.
