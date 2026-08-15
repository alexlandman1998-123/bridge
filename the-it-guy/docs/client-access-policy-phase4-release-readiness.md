# Client Access Policy Phase 4 Release Readiness

Phase 4 locks the product decision across the remaining backend and release
surfaces.

## Product Decision

- Buyer onboarding is available before OTP globally.
- Agents can still capture buyer onboarding manually.
- Kingstons buyer onboarding and buyer portal access remain outside the normal
  pre-OTP flow; the Kingstons buyer portal waits for signed OTP evidence.
- Seller mandate signing links are retired.
- Seller mandates must be signed offline and uploaded manually.
- Seller Portal activates only after a manually uploaded signed mandate, or a
  final signed mandate artifact linked to the listing.

## Release Gate

The release is ready only when:

- frontend workspaces use the canonical buyer and seller access policy;
- buyer portal email delivery is blocked until onboarding or signed OTP evidence
  is present;
- Kingstons buyer portal email delivery is blocked until signed OTP evidence is
  present;
- seller portal email delivery is blocked until signed mandate evidence is
  present;
- generic email routing, packet-bound signing delivery, job-runner delivery, and
  public signer completion all refuse seller mandate signing links;
- OTP signing remains available only through packet-bound delivery;
- post-signed-mandate Seller Portal invitations remain available after signed
  mandate evidence is present.

## Verification

Run the full client-access chain:

```bash
npm run verify:client-access-policy
```

Run the Phase 4 release gate directly:

```bash
npm run test:client-access-policy-phase4
```
