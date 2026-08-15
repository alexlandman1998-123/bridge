# Client Access Policy Phase 5 Operational Smoke

Phase 5 adds a static operational smoke check for the buyer and seller portal
policy after the Phase 4 release gate.

## Scope

- Buyer onboarding remains available before OTP globally.
- Agent manual capture remains available for buyer onboarding globally.
- Kingstons signed OTP evidence is still required before Kingstons buyer portal
  access.
- Seller Portal activation still requires manual signed mandate upload, or a
  final signed mandate artifact linked to the listing.
- Seller mandate signing links remain retired across email routing, packet
  signing delivery, job-runner delivery, and public signer completion.

## Smoke Behavior

The Phase 5 smoke is static by design. It reads local Supabase configuration,
Edge Function source, package scripts, and this operational document.

It does not call live Supabase Functions, performs no live email delivery, and
does not generate portal links. This makes it safe to run before rollout, during
rollout, and after rollout as a regression check.

## Operational Checks

- `send-email` and `send-mandate-signing-email` remain enabled with JWT
  verification.
- `legal-document-job-runner` remains configured with JWT verification if it is
  enabled for a controlled run.
- `signer-signing-action` remains public, and the retired seller mandate path is
  enforced in code before any legacy send operation can run.
- Buyer portal email delivery still blocks normal developments until onboarding
  completion or signed OTP evidence.
- Buyer portal email delivery still blocks Kingstons until signed OTP evidence.
- Seller Portal email delivery still blocks until signed mandate evidence.
- Seller mandate signing delivery remains retired at every backend doorway.

## Verification

Run the operational smoke directly:

```bash
npm run verify:client-access-policy:operational
```

Run the full chain:

```bash
npm run verify:client-access-policy
```
