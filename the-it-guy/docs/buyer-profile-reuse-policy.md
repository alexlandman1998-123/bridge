# Buyer Profile Reuse Policy — Phase 0

## Decision

Arch9 stores buyer information and buyer documents once in a reusable Buyer Profile. All future transactions reference the profile source and record a usage receipt; they do not ask the buyer to submit the same material again or create a duplicate file.

This applies to identity/FICA documents, contact details, addresses, employment and income data, funding information, entity/trust data, authority documents, and every newly introduced buyer-onboarding input by default.

## Transaction record

A transaction keeps a reference to the buyer-profile source, the source version used, and the time it was used. This preserves legal and operational traceability while allowing a buyer’s profile to serve their future transactions.

## Product rule

The transaction experience must offer an explicit "Reuse buyer profile" path. It may ask the user to confirm that the existing material is still correct, but it must not require a new upload or re-key the same information.
