# Document Generator Simple Signing Phase 0

## Scope

Phase 0 locks the target scope for the simplified signer-facing UI shown in the reference images.

This is a UI-only scope phase for all generated documents that currently move through the unified signer portal. The first covered generated packet types are `Mandate` and `Offer to Purchase`.

## State Model

Every generated document signer session must resolve to one of five states:

1. `review` - the signer can open and read the document.
2. `sign` - the signer has required fields to complete.
3. `finish` - all required fields are complete and the signer can submit.
4. `completed` - the signer has completed their part and may open the completed PDF when available.
5. `blocked` - the signing link is expired, declined, unavailable, or otherwise needs help.

## Boundaries

Phase 0 makes no email delivery changes, no final-artifact changes, no final-completion truth changes, no signing-token authority changes, and no storage-access changes.

Later phases may change the signer portal presentation, but they must continue to call the existing signing APIs for session resolution, field application, signature asset capture, signing completion, and final signed access.

## Acceptance

The scope is locked when mandate and OTP coverage is explicit, the five-state model is testable, and the backend boundary stays false for dispatch, final artifacts, completion truth, token authority, and storage access.
