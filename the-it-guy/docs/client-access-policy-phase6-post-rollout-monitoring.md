# Client Access Policy Phase 6 Post-Rollout Monitoring

Phase 6 turns the buyer and seller portal policy into a post-rollout monitoring
contract. It keeps the rollout observable after Phase 5 without sending any
email or creating any portal access.

## Scope

- Buyer onboarding remains available before OTP globally.
- Kingstons signed OTP evidence is still required before Kingstons buyer portal
  access.
- Agent manual capture remains available for buyer onboarding globally.
- Seller Portal activation still requires manual signed mandate evidence.
- Seller mandate signing links remain retired.

## Monitoring Signals

The blocked paths now emit stable `[client-access-policy]` monitoring lines:

- buyer portal sends blocked by onboarding or Kingstons signed OTP readiness;
- Seller Portal invitations blocked by missing signed mandate evidence;
- retired seller mandate signing requests through the packet signing sender;
- retired seller mandate signing requests through the generic email router;
- retired seller mandate signing jobs through the legal document job runner;
- retired seller mandate signing attempts from public signer completion.

The monitoring lines intentionally avoid portal tokens, signing tokens, service
credentials, and recipient email fields.

## Rollout Review

For the first 24-hour rollout window, review the Phase 6 report together with
Supabase function logs and existing packet/listing audit events. The report does
not depend on deprecated Management API log endpoints; it is a local static
contract that identifies which reason codes and audit events operators should
look for.

Expected blocked outcomes are not incidents by themselves. They mean the product
guard is working:

- `buyer_portal_waiting_for_onboarding_or_otp`;
- `buyer_portal_waiting_for_signed_otp`;
- `seller_portal_invite_requires_signed_mandate`;
- `seller_mandate_signing_links_retired`.

## Rollback Guidance

Rollback should be considered only if valid, policy-ready portal sends are
blocked or retired seller mandate signing attempts are still creating live
delivery artifacts. Roll back the application or Edge Function release first and
keep the additive audit evidence intact for support triage.

This phase performs no live email delivery, does not generate portal links, and
does not mutate production data.

## Verification

Run the monitoring report directly:

```bash
npm run verify:client-access-policy:monitoring
```

Run the full chain:

```bash
npm run verify:client-access-policy
```
