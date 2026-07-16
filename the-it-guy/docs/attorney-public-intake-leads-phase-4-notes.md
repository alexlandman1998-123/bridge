# Attorney Public Intake & Leads — Phase 4 Journey Notes

Phase 4 delivers the public Attorney Journey link on top of the Phase 3 database boundary. It does not add the internal Attorney Leads CRM, assignment tools, conversion, notifications, or any change to Incoming Matters.

## Public route

- Canonical route: `/journey/:slug`
- No authentication or token gate
- The slug is resolved through the public-safe Phase 3 resolver
- Invalid, disabled, archived, or inactive-firm links render an unavailable state
- No organisation, firm, member, contact, or Lead identifier is returned to the browser

## Journey experience

- Branded firm identity with safe ARCH9 fallbacks
- Linktree-style choice between the six contracted Attorney services
- Short, mobile-first form with one-hand-friendly controls
- Optional transfer-quote fields for property value and buyer/seller role
- Email-or-mobile contact validation
- Explicit privacy consent using version `arch9-attorney-intake-v1`
- Source, campaign, and bounded UTM attribution
- Confirmation, loading, retry, and validation states
- Session-scoped idempotency for repeat clicks and refreshes
- Subtle ARCH9 security attribution and direct firm contact links

## Public Edge Function

The `attorney-public-intake` function is intentionally callable without a user session. It is the only browser-facing submission boundary and:

- accepts only `resolve` and `submit` actions;
- bounds request bodies before parsing;
- validates the public slug and service allowlist;
- sanitises attribution a second time at the server boundary;
- uses a hidden honeypot to discard obvious bot submissions;
- hashes requester IP addresses with SHA-256 and a server-side secret;
- applies per-link/IP limits of five accepted submissions per ten minutes and fifteen per hour;
- invokes the service-role-only Phase 3 atomic command;
- maps database failures to stable, non-sensitive public errors; and
- returns only `accepted`, `duplicate`, and `code` after submission.

The Edge Function performs the fast throttle check. The atomic database command repeats it under a per-link/IP transaction advisory lock, so simultaneous requests cannot race past the limits.

Set `ATTORNEY_INTAKE_IP_HASH_SECRET` in hosted environments. The function securely falls back to the service-role key as hash material so raw IP addresses are never persisted, but a dedicated rotatable secret is preferred operationally.

## Deferred intentionally

- Internal Attorney Leads table and detail workspace
- Manual Lead capture
- Assignment, activity, and follow-up commands
- Email or in-app notifications
- Lead-to-Matter conversion
- CAPTCHA or managed bot-challenge integration
- Custom domains, embeds, and per-user links
- Remote function deployment or database migration deployment

## Deployment gate

Before staging release, deploy the Phase 2 and Phase 3 migrations, configure the IP hash secret, deploy the Edge Function, create one active intake-link fixture, and run a real browser-to-function-to-database smoke test with duplicate and throttling assertions.
