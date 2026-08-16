# Buyer Offer + Onboarding 3-Stage Experience Audit

Authoritative boundary:
[Lead, Listing, Offer, Transaction Workflow Contract - Phase 0](../the-it-guy/docs/lead-listing-transaction-workflow-contract-phase0.md).
This flow captures offer-context buyer details before transaction creation; true
transaction buyer onboarding starts only after accepted-offer conversion creates
or reuses a transaction.

## Scope

This audit supports the refactor of the public buyer offer link into a single guided experience:

1. Landing
2. Offer
3. Buyer onboarding
4. Review and submit
5. Confirmation

The product intent is that the buyer creates or responds to the offer from the secure link, then completes buyer onboarding before final review and submission. The agent should not need to create a transaction first just to send the buyer into this flow.

## Existing Architecture

- Public buyer entry points are routed through `BuyerOfferSubmission` at `/client/offer/:token` and `/offers/:token`.
- Canonical offers resolve through `getCanonicalOfferInviteContext(token)`, which fetches the offer, marks draft/sent offers as viewed, and returns listing, invite, and lifecycle context.
- Legacy browser-backed offers still resolve through `getOfferInviteContext(token)` and submit through `submitBuyerOffer`.
- Canonical submissions use `submitCanonicalBuyerOffer`, preserving current offer schema, lifecycle behavior, and agent notification side effects.
- Seller onboarding already uses `PremiumOnboardingLanding`, token-based progress, save/resume, and a branded first screen. That component is now reused for the buyer offer link.

## Refactor Direction

- Keep the existing public token model and backend submit functions.
- Introduce a buyer-stage state machine in `BuyerOfferSubmission`: `landing`, `offer`, `onboarding`, `review`, `complete`.
- Save stage, active onboarding section, form values, and confirmation locally against the token so the buyer can resume.
- Reuse `resolveOnboardingBranding` and `PremiumOnboardingLanding` so the first screen is agency branded and aligned with seller onboarding.
- Make offer terms the first actionable stage. Buyer onboarding follows only after the offer amount is started.
- Use one renderer for mobile and desktop so desktop no longer shows all sections before the buyer has progressed through the flow.

## Preserved Behavior

- Token lookup and invalid/expired link handling remain unchanged.
- Canonical offer lifecycle gates remain unchanged, including counter-offer, under-review, accepted/converted, and terminal states.
- Current offer schema fields are preserved.
- Current canonical and legacy submit paths are preserved.
- Agent offer-submitted notification is preserved.

## Remaining Follow-Up

- Replace placeholder URL-based proof-of-funds capture with the final document upload service when available.
- Expand buyer onboarding fields once the definitive buyer/FICA schema is finalized.
- Connect final OTP signing as a distinct post-review signing stage when the signing backend is ready for this route.
- Add durable server-side draft persistence if resume must work across devices.
