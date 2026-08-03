# OTP Template vNext Phase 3 Buyer Offer Link Upgrade

Generated: 2026-08-02
Status: OTP_BUYER_OFFER_LINK_VARIANT_AWARE
Mutated data: false

## Purpose

Phase 3 upgrades the buyer offer link from a generic residential offer capture into a route-aware OTP intake surface. The buyer link now carries the OTP document variant and captures structured commercial terms needed before OTP generation.

The goal is not to make the buyer supply every OTP fact. The buyer link owns buyer-side facts and buyer-side commercial terms only. Seller, developer, conveyancer, title, compliance, commission and legal wording remain outside the buyer link.

## Code Changes

| Area | File | Change |
| --- | --- | --- |
| Offer terms model | `src/core/offers/residentialOfferTerms.js` | Bumped terms version to `residential_offer_terms_phase3_v1`, added `otp_route` bucket, `otpDocumentVariant`, structured suspensive condition records, guarantee/cash/deadline fields, subject-to-sale detail fields and development acknowledgements. |
| Offer link invite | `src/lib/listingOffersService.js` | `createOfferInvite()` now resolves and stores `otpDocumentVariant`, `transactionType` and `developmentId`; buyer submission carries those into the residential offer terms snapshot. |
| Canonical offer path | `src/lib/buyerLifecycleService.js` | Canonical offer insert/submission now carries OTP variant context and listing development signals into `conditions_json`. |
| Agent-assisted offers | `src/lib/agentAssistedOfferEntry.js` | Agent-assisted capture now passes draft context into the terms snapshot so variant fields can be preserved. |
| Buyer page | `src/pages/BuyerOfferSubmission.jsx` | Buyer-facing form now displays the OTP route and captures deadline, guarantee, occupation/rent, subject-to-sale, fixture and development acknowledgement fields. |
| Lifecycle contract | `src/core/offers/residentialOfferLifecycle.js` | Offer + Onboarding link data buckets now include `otp_route`. |
| Tests | `scripts/residential-offer-link-phase3.test.mjs` | New contract test for route-aware buyer offer capture. |

## Buyer Link Route Contract

The link resolves one of:

- `resale_existing_property`
- `new_development`

Resolution sources:

- explicit invite `otpDocumentVariant`
- canonical offer conditions
- listing or transaction `transactionType`
- listing/property/unit `developmentId`
- fallback to `resale_existing_property` only when no development signal exists

Phase 4/9 should make unknown or unsafe fallback behavior blockable at generation time.

## Structured Commercial Terms Captured

| Term family | Fields |
| --- | --- |
| OTP route | `otpDocumentVariant` |
| Deposit | `depositAmount`, `depositDueDate` |
| Bond | `financeType`, `bondAmount`, `bondApprovalDeadline` |
| Cash | `cashContribution`, `cashProofDeadline`, proof/pre-approval references |
| Guarantees | `guaranteeDeliveryDeadline`, `guaranteeDeliveryPeriod` |
| Offer validity | `expiryDate`, `expiryTime` |
| Occupation/rent | `occupationDate`, `occupationalRent`, `occupationalRentAmount` |
| Subject-to-sale | `subjectToSale`, `subjectSaleProperty`, `subjectSaleMinimumPrice`, `subjectSaleFulfilmentDate`, `subjectSaleTimeline`, `subjectSaleAgentInvolved` |
| Fixtures | `includedFixtures`, `excludedFixtures` |
| Special wording | `suspensiveConditions`, `specialConditions` |
| Development acknowledgements | `acknowledgeDevelopmentRules`, `acknowledgeNhbrcWarranty`, `acknowledgeBodyCorporateRules`, `acknowledgeUtilityConnectionCharges` |

## Structured Suspensive Condition Records

The offer snapshot now derives `structuredConditions` under `conditionRequests`.

| Condition type | Trigger | Review status |
| --- | --- | --- |
| `bond_approval` | Bond/hybrid finance, bond amount or bond deadline | `structured` |
| `subject_to_sale` | Buyer marks offer subject to another property sale | `agent_review_required` |
| `cash_proof` | Cash/hybrid finance, cash amount or cash proof deadline | `structured` |
| `guarantee_delivery` | Guarantee deadline or guarantee period | `structured` |
| `other_suspensive_condition` | Buyer enters free-text suspensive wording | `agent_review_required` |

The buyer can still request special/free-text wording, but that wording remains blocked behind agent review before OTP generation.

## Explicit Ownership Boundary

Buyer link owns:

- buyer identity
- buyer capacity signal
- finance route
- buyer-side offer terms
- buyer-side condition requests
- buyer acknowledgements

Buyer link does not own:

- seller bond/rates/disclosure/defects
- developer legal identity
- development unit legal facts
- conveyancer/trust account details
- title facts
- compliance certificates
- commission/FFC
- final legal wording

## Phase 3 Exit Criteria

Phase 3 is complete when:

1. Buyer offers carry `otpDocumentVariant`.
2. Development-linked listings resolve to `new_development`.
3. Normal/resale listings resolve to `resale_existing_property`.
4. Deadlines for deposit, bond, cash proof and guarantees are captured.
5. Subject-to-sale is structured with property, minimum price and fulfilment date.
6. Occupation/rent is structured enough for Phase 6 clause generation.
7. New-development acknowledgements are captured without asking the buyer for developer-owned facts.
8. Agent review still blocks buyer free-text legal wording.

## Blockers Carried Forward

| Priority | Blocker | Next phase |
| --- | --- | --- |
| P0 | Structured condition records are captured, but not yet part of a canonical merge-field registry. | Phase 4 |
| P0 | Definitions and clause families are still not enforced against captured buyer terms. | Phase 4/6 |
| P0 | The current OTP template still lacks production shell and route-specific content. | Phase 5/6 |
| P0 | Runtime generation does not yet hard-block variant mismatch or unsafe fallback. | Phase 7/9 |

