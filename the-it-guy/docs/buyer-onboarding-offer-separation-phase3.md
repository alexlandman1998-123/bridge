# Buyer Onboarding / Offer Separation - Phase 3

Date: 2026-08-12

Purpose: keep the restored buyer onboarding send path distinct from offer creation, offer portal sessions, seller review, and OTP evidence.

## Boundary Rules

1. `Send Buyer Onboarding` sends `client_onboarding` and must resolve to `/client/onboarding/:token`.
2. Offer portal/session links stay labelled as offer work and resolve to `/offers/...`.
3. Buyer onboarding success UI displays `lastBuyerOnboardingLink` only.
4. Offer portal state in appointment history uses offer labels: `Offer link sent`, `Offer portal opened`, `Offer submitted`.
5. OTP upload remains transaction evidence. It does not imply that the onboarding send action should create an offer link.

## Current Implementation Notes

- The legacy `createAndSendOfferLinkForLead` helper remains available for explicit offer flows.
- Buyer onboarding handlers do not call the offer-link helper.
- Appointment history can show offer portal status, but onboarding send panels do not render offer portal status as onboarding progress.
