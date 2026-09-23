# Rental Property24 Phase 6 — Production Pilot Guard

Phase 6 adds a server-side guard for a single approved Property24 rental production pilot. It does not enable credentials, set environment variables, submit a listing, or promote a pilot.

Before a rental production publish can pass the guard, all of the following must be configured server-side:

- `PROPERTY24_RENTAL_LIVE_PUBLISH_ENABLED=true`
- `PROPERTY24_RENTAL_PRODUCTION_APPROVAL_ID` with the recorded pilot approval
- `PROPERTY24_RENTAL_PRODUCTION_AGENCY_ALLOWLIST` containing exactly one agency ID
- `PROPERTY24_RENTAL_PRODUCTION_PILOT_LISTING_ID` matching the one requested rental listing

The release gate also requires accepted Phase 5 ExDev evidence, production-only credentials that pass the read-only access audit, and monitoring confirmation. A completed pilot still requires a separate explicit approval before expansion.

Run the local contract check with:

```bash
npm run test:rental-property24-phase6-cutover
```
