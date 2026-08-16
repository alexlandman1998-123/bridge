# Buyer Lead Offer Readiness - Phase 2

Date: 2026-08-15

Purpose: enforce the buyer lead qualification gate between buyer search,
listing interest, offer work, and transaction buyer onboarding.

## Implemented Gate

The buyer lead readiness model now has four operational states:

- `search_opportunity`: buyer lead has no selected operational `listing_id`;
  it may be nurtured or matched to stock, but it is not offer-ready.
- `listing_interest`: buyer lead has a selected listing, but still lacks
  contact detail or minimum buyer-intent qualification.
- `offer_ready`: buyer lead has selected listing, contact channel, and at least
  two buyer-intent facts, so offer link work can start.
- `accepted_offer_ready` / `transaction_ready`: buyer can enter true
  transaction buyer onboarding because an accepted offer or transaction exists.

## Buyer Intent Variables

Quick-create buyer leads now capture and preserve these Phase 2 variables:

- budget;
- finance route;
- buying timeline;
- search/property requirement;
- selected current listing where known.

The intent values are persisted into the existing structured buyer
qualification note block so the Agency buyer workspace can reuse the same
qualification evidence.

## Action Boundaries

- Buyer lead without `listing_id` remains a search opportunity.
- Offer link creation requires selected `listing_id`, contact details, and
  minimum qualification evidence.
- Non-Kingstons buyer journey action sends an offer link, not transaction buyer
  onboarding.
- Transaction buyer onboarding refuses to bootstrap a transaction from a plain
  buyer lead. It requires an existing transaction or accepted-offer conversion.
- Workspace copy now labels pre-transaction send actions as `Send Offer Link`.

## Verification

- `node scripts/buyer-lead-offer-readiness-phase2.test.mjs`
- `npm run build`
