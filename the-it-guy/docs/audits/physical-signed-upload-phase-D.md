# Physical Signed Upload Phase D

Implemented on 2026-07-31.

## Goal

Support post-signing amendment handling when an OTP or mandate is already sent, partially signed, completed, or finalized and an agent needs to change terms, clauses, or captured details.

## What Changed

- Added a post-signing amendment request panel in the legal document workspace.
- Required an amendment reason and change summary before recording the request.
- Persisted amendment requests in `postSigningAmendmentRequests` and `post_signing_amendment_requests`.
- Added `latestPostSigningAmendmentRequest` metadata for quick workspace visibility.
- Added a `post_signing_amendment_requested` audit event.
- Added an action to open Document Builder, where the existing addendum flow links the new document back to the original packet.

## Safety

- The original record is not mutated.
- No downstream retrigger happens when the amendment need is recorded.
- Editable documents continue to use the Phase C controlled change flow before signing.
- Sent, partially signed, completed, and final-artifact records use addendum/amendment handling instead of direct edits.
- Existing addendum readiness rules still require an original document link and change summary before generation.
