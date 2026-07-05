# Document Start Phase 4

Implemented on 2026-07-05.

## Goal

Wire the Listing Create Mandate entry point into the same Start Document modal and Legal Document Workspace used by seller lead mandates.

## What Changed

- The listing follow-up action now says Create Mandate instead of only marking the mandate ready.
- Create Mandate opens the Start Document modal with saved details, manual details, and seller onboarding paths.
- Saved/manual paths open a listing-scoped legal workspace route.
- Seller onboarding still sends or prepares the existing seller onboarding link.
- The legal workspace can hydrate mandate context from `listingId`.
- Generated packet source context keeps the listing ID for traceability.

## UX Rules Preserved

- Agents choose a start path before entering the document editor.
- The existing mandate intake panel remains the only manual capture surface.
- Listing facts and seller onboarding data prefill the same mandate draft fields.
- Back navigation returns to the listing instead of a lead page.
- No duplicate mandate editor.

## Safety Boundaries

- No schema change.
- No signing changes.
- No automatic send behavior.
- No fake lead ID when a listing has no seller lead.
- Existing seller lead mandate routes remain unchanged.
- Existing transaction OTP routes remain unchanged.

## Next Phase

Phase 5 can apply the same start-document pattern to transaction-level OTP creation.
