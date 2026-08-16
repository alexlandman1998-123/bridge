# Developer Module Phase 6 Post-Rollout Monitoring

Phase 6 turns the developer module fixes into a post-rollout monitoring
contract. It is designed for the first 24-hour window after deployment, when the
team needs a fast answer to: can we still create development transactions, send
the buyer onboarding link, and progress the correct workflow gates?

## Scope

- Developer transaction creation should complete even when optional setup rows
  report recoverable RLS or schema issues.
- Buyer onboarding link sending remains available from the developer unit
  workspace.
- Bond originator handoff is recorded when buyer onboarding is sent.
- Seller onboarding remains excluded from new development workflow blockers.
- Signed OTP remains a manual upload gate before finance movement.
- Reservation deposit appears before OTP only when the development transaction
  has reservation deposit requirements enabled.
- Required documents, transaction subprocesses, transaction status links, and
  transaction onboarding keep their transaction-spine scoped RLS policies.

## Monitoring Signals

Run the Phase 6 report after deployment:

```bash
npm run verify:developer-module:monitoring
```

Expected healthy signals:

- `transaction.creation.recoverable_setup_warnings` passes, proving setup
  warnings remain visible instead of breaking the workspace shell.
- `buyer_onboarding.send_and_handoff_visible` passes, proving the unit workspace
  still sends buyer onboarding and records the handoff.
- `workspace.clicks.no_full_page_refresh_regression` passes, proving critical
  click paths remain client-side actions instead of full-page refreshes.
- `workflow.development_sale_gates` passes, proving seller onboarding is not a
  development blocker while buyer onboarding and signed OTP still gate finance.
- `lifecycle.reservation_deposit_before_otp` passes, proving reservation deposit
  can sit between Confirmed and OTP when relevant.
- The RLS checks pass for required documents, subprocesses, status links, and
  onboarding.

The monitoring report is static. It performs no live email delivery, does not
open buyer links, does not create transaction rows, and does not mutate
production data.

## Rollout Review

For the first 24-hour window, run the full release chain and the monitoring
report whenever a user reports one of these symptoms:

- new row violates row-level security policy for developer transaction setup;
- buyer onboarding link cannot be sent;
- clicking a developer workspace action refreshes the page;
- workflow blockers mention seller onboarding for a new development;
- reservation deposit is missing before OTP on a reservation-enabled sale.

Use Supabase function and database logs for incident triage, but do not depend
on deprecated Management API log endpoints. The local report identifies which
source-level contracts should be present before looking at live logs.

## Rollback Guidance

Rollback should be considered if valid developer transactions are blocked by
RLS, buyer onboarding sends stop working for policy-ready records, or workspace
actions begin causing full-page refreshes. Roll back the application release
first, then re-check the RLS repair migrations before changing database policy.

Keep additive audit evidence and setup warnings intact for support triage. Do
not paste portal tokens, onboarding tokens, signed URLs, service credentials, or
client contact details into monitoring evidence.

## Verification

Run the monitoring report directly:

```bash
npm run verify:developer-module:monitoring
```

Run the full developer module chain:

```bash
npm run verify:developer-module
```
