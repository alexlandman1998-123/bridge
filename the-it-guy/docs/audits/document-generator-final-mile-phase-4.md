# Document Generator Final-Mile Phase 4

Date: 2026-07-26

## Objective

Make the workspace UI truthful even if the server returns contradictory final completion fields.

## Implementation

Added:

- `src/core/documents/finalCompletionTruth.js`

Updated:

- `src/components/documents/LegalDocumentWorkspace.jsx`
- `src/core/documents/signingOperationalStatus.js`
- `src/core/documents/signingCompletionCertificate.js`

## Required Truth

The UI, operational status, and certificate builder now normalize final completion before presenting it. A payload with `ready=true` and `stage=completed_everywhere` is downgraded to `awaiting_recipient_delivery` when delivery is incomplete.

The workspace must show:

- `Signed PDF safe — completion pending`
- `Recipient delivery: 0/2`
- `Retry completion`

It must not show `Completed everywhere` until delivery counts and `deliveryReady` agree.

## Not Included

This phase does not deploy the migration or retry the affected staging packets. That remains Phase 5.
