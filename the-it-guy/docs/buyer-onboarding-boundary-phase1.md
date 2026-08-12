# Buyer Onboarding Boundary Audit - Phase 1

Date: 2026-08-12

Purpose: confirm where the Agency buyer workspace is sending true buyer onboarding versus offer links, before restoring the current branded buyer onboarding form.

## Confirmed Route Boundaries

- True buyer onboarding route: `/client/onboarding/:token`
  - App route: `src/App.jsx`
  - Page: `src/pages/ClientOnboarding.jsx`
  - Fetch/submit APIs: `fetchClientOnboardingByToken`, `saveClientOnboardingDraft`, `submitClientOnboarding`
  - Email type: `client_onboarding`
  - Data source of truth: transaction onboarding record and saved onboarding `formData`
- Offer routes:
  - `/offers/session/:token`
    - Page: `src/pages/PostViewingOfferPortal.jsx`
    - Created by `createOfferPortalSession`
  - `/offers/:token`
    - Page: `src/pages/BuyerOfferSubmission.jsx`
    - Created by `createCanonicalOffer`
  - Email type: `buyer_offer_link`
  - Data source of truth: offer/session state and offer `conditions`

## Agency Buyer Send Actions

### True Buyer Onboarding

- `src/pages/agency/AgencyPipelinePage.jsx`
  - `handleSendBuyerOnboardingFromLead`
  - When `selectedLeadLinkedTransactionId` exists, it invokes `send-email` with `type: 'client_onboarding'`.
  - This is the correct send path because it produces the `/client/onboarding/:token` experience.
  - Current entry points:
    - Main lead action menu.
    - Secondary lead action menu.
    - Finance readiness CTA labelled `Send Finance Form`.
    - Buyer journey action `handleBuyerJourneyMakeOfferAction`, but only after it reaches `handleSendBuyerOnboardingFromLead`.

### Offer Link Presented As Buyer Onboarding

- `src/pages/agency/AgencyPipelinePage.jsx`
  - `handleSendBuyerOnboardingFromAppointment`
  - Calls `createAndSendOfferLinkForLead`.
  - Creates `/offers/session/:token` when there is a viewing appointment context.
  - Creates `/offers/:token` when there is no viewing appointment context.
  - Sends email with `type: 'buyer_offer_link'`.
  - Current misleading entry points:
    - Appointment workspace card: `Send Buyer Onboarding Link`.
    - Buyer Onboarding + OTP workspace header button: `Send Buyer Onboarding`.
    - Buyer Onboarding + OTP step 2 form: `Send Buyer Onboarding`.
    - Success UI: `Buyer onboarding link ready: {offerLinkForm.lastOfferLink}` even though the stored URL is an offer URL.

### Mixed / Risky Branch

- `handleSendBuyerOnboardingFromLead`
  - If a linked transaction exists: correct `client_onboarding` path.
  - If no linked transaction exists: falls back to `createAndSendOfferLinkForLead` with `successPrefix: 'Offer + onboarding '`.
  - Boundary decision: Phase 2 should replace this fallback with transaction-backed onboarding creation, or change the visible action to `Send Offer Link` when the product explicitly wants offer capture first.

## Data Boundary Findings

- Buyer profile should hydrate from:
  - `selectedLeadLifecycleDiagnostic.onboarding.form_data`
  - `selectedLeadLifecycleDiagnostic.onboardingPrefill.form_data`
  - linked transaction onboarding state
  - transaction/lead/contact fallback only when no onboarding data exists
- Buyer profile should not treat offer `conditions` or offer portal metadata as the canonical submitted buyer profile.
- Current `selectedLeadClientIntakePreference` still reads offer `conditions` as a fallback. That is acceptable as a transitional fallback only, but it should not become the primary source for submitted profile details.

## Branding Boundary Findings

- Seller onboarding and buyer onboarding both use `resolveOnboardingBranding`.
- Seller onboarding is already treated as the branding reference experience.
- Buyer onboarding (`ClientOnboarding`) already receives `branding` from `fetchClientOnboardingByToken`.
- The restored Agency send path must send `client_onboarding` so the buyer lands on the branded `ClientOnboarding` page, not the separately branded offer-link pages.

## Phase 1 Boundary Decisions

1. `Send Buyer Onboarding` means `client_onboarding` and `/client/onboarding/:token`.
2. `Send Offer Link` means `buyer_offer_link` and `/offers/...`.
3. The Buyer Onboarding + OTP workspace may include OTP upload and transaction prep, but its send action must not generate offer URLs.
4. Offer creation/review remains a separate flow and should be labelled as offer work.
5. Phase 2 must decide how to create or reuse a transaction before sending onboarding from a buyer lead with no existing transaction.

## Recommended Phase 2 Entry Criteria

- A selected buyer lead and selected property/listing are available.
- If `selectedLeadLinkedTransactionId` exists, send `client_onboarding` directly.
- If no transaction exists, create/reuse a transaction-backed buyer onboarding record before sending.
- After send, store and display the `/client/onboarding/:token` link, not an offer URL.

