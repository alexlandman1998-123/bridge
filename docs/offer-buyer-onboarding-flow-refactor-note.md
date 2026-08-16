# Offer + Buyer Onboarding Flow Refactor Note

Authoritative boundary:
[Lead, Listing, Offer, Transaction Workflow Contract - Phase 0](../the-it-guy/docs/lead-listing-transaction-workflow-contract-phase0.md).
Use `Buyer Lead -> Offer -> Accepted Offer -> Transaction` as the normal
workflow language; do not use buyer offer links as shorthand for transaction
buyer onboarding.

## Current Plumbing

- Public routes are defined in `the-it-guy/src/App.jsx`:
  - `/client/offer/:token` and `/offers/:token` render `BuyerOfferSubmission`.
  - `/offers/session/:token` renders `PostViewingOfferPortal`.
  - `/client/onboarding/:token` renders `ClientOnboarding`.
  - `/client/:token/selling` and `/seller/onboarding/:token` cover seller onboarding surfaces.
- The public offer page is `the-it-guy/src/pages/BuyerOfferSubmission.jsx`.
  - It supports legacy local invite storage through `getOfferInviteContext` / `submitBuyerOffer`.
  - It supports canonical Supabase offers through `getCanonicalOfferInviteContext` / `submitCanonicalBuyerOffer`.
  - It saves resumable public-link drafts to `localStorage` under `arch9:buyer-offer-onboarding-draft:<token>`.
- Offer submission still relies on the existing payload field names consumed by:
  - `the-it-guy/src/lib/listingOffersService.js`
  - `the-it-guy/src/lib/buyerLifecycleService.js`
  - `the-it-guy/src/core/offers/residentialOfferTerms.js`
- The existing backend model keeps buyer identity, offer finance, conditions, acknowledgements, and OTP routing in the residential offer terms snapshot. This refactor reorganises the UI only and does not create new tables, routes, or submit APIs.

## Field Ownership

- Offer:
  - Property context is display-only.
  - Buyer-entered commercial terms: offer amount, deposit, finance type, offer expiry date.
  - Conditional commercial/legal terms are progressively disclosed: bond approval, sale of existing property, occupational rent, other conditions.
- Buyer Verification:
  - Buyer identity and contact fields remain in the existing onboarding stage.
  - Finance readiness details such as proof-of-funds URL and buyer-side funding signals remain in the onboarding stage.
  - Compliance confirmation remains in the onboarding stage and review.
- Review & Sign:
  - Existing submit sequence remains unchanged.
  - `bondAmount` is derived from `offerAmount - depositAmount` at submission time for compatible downstream persistence.

## Constraints Preserved

- No schema changes.
- No new public routes.
- No replacement offer architecture.
- Existing legacy and canonical offer submissions still call the same service functions.
- Existing OTP route resolution still uses `resolveOtpDocumentVariant`.
- Existing agent notification uses the same `buyer_offer_submitted_agent` email route.
