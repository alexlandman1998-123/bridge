# OTP Template vNext Phase 2 Route Universe And Data Ownership

Generated: 2026-08-02
Status: OTP_ROUTE_UNIVERSE_READY_FOR_INTAKE_DESIGN
Mutated data: false

## Purpose

Phase 2 turns the Phase 1 field inventory into a canonical OTP route universe and source-ownership contract. The goal is to prevent OTP from repeating the mandate-generator problem where legal content, data ownership and fallback behavior were implied instead of enforced.

The code-level source of truth is `src/core/documents/otpRouteUniverse.js`.

## First-Class OTP Variants

| Variant | Use when | Required source owners |
| --- | --- | --- |
| `resale_existing_property` | Existing seller sells an existing full-title, sectional-title, HOA/estate, share-block, agricultural or vacant-land property. | buyer onboarding, seller onboarding, listing/property, transaction offer terms, conveyancer assignment, organisation/agent settings, legal template registry, signing runtime |
| `new_development` | Developer sells a development unit/off-plan/newly built unit with development-specific title, VAT, scheme, unit, NHBRC, body-corporate, connection-charge and handover/snagging facts. | buyer onboarding, development setup, development unit setup, transaction offer terms, conveyancer assignment, organisation/agent settings, legal template registry, signing runtime |

`otp_default_v1` remains a transition/starter default only. It must not be treated as proof that either variant is launch-ready.

## Route Dimensions

| Dimension | Values |
| --- | --- |
| Document variant | `resale_existing_property`, `new_development` |
| Buyer party | `individual_unmarried`, `individual_married_in_community`, `individual_married_out_of_community`, `individual_customary_marriage`, `individual_islamic_marriage`, `individual_foreign_marriage`, `co_purchasers`, `company_or_cc`, `trust`, `foreign_purchaser` |
| Seller party | `individual_unmarried`, `individual_married_in_community`, `individual_married_out_of_community`, `company_or_cc`, `trust`, `foreign_seller`, `developer_seller` |
| Property title | `full_title_erf`, `full_title_estate_or_hoa`, `sectional_title_unit`, `share_block_or_scheme`, `agricultural_or_vacant_land`, `new_development_unit` |
| Finance | `cash`, `bond`, `hybrid_cash_and_bond`, `subject_to_sale_of_purchaser_property`, `other_suspensive_condition` |
| Occupation | `on_registration`, `before_registration_with_rent`, `before_registration_no_rent`, `after_registration`, `development_handover` |
| Compliance | `electrical`, `electric_fence`, `gas`, `occupancy_certificate`, `nhbrc`, `rates_clearance`, `levy_clearance` |

## Shared Route Packs

The two OTP variants share reusable packs where the legal concept is common but route-controlled:

| Pack family | Packs |
| --- | --- |
| Buyer | buyer individual capacity, company authority, trust authority, spouse consent, co-purchaser, foreign purchaser |
| Seller/developer | seller individual capacity, company authority, trust authority, spouse consent, developer seller |
| Property | full title, sectional title, new-development unit |
| Finance | cash, bond, hybrid |
| Conditions | subject-to-sale, other suspensive condition |
| Resale/admin | occupation/rent, fixtures/fittings, disclosure/defects, compliance certificates, transfer/conveyancer |
| Commercial/agency | commission |
| Signing | route-aware signature pack |

## Source Ownership

| Source owner | Owns | Must not own |
| --- | --- | --- |
| Buyer onboarding / buyer offer link | Buyer identity, buyer capacity, buyer finance readiness, buyer-side conditions, buyer acknowledgements. | Seller facts, developer facts, conveyancer facts, agent FFC, commission, title facts. |
| Seller onboarding | Seller identity, seller capacity, seller disclosure, defects, seller bond/rates, seller-side fixtures and certificates. | Buyer finance, buyer conditions. |
| Listing / property record | Property address, erf or unit facts, title type, HOA/sectional facts, seller-approved fixtures metadata. | Legal wording. |
| Development setup | Developer seller, development, contractor, scheme, VAT basis, body corporate, NHBRC, rules/specifications. | Buyer identity, buyer finance. |
| Development unit setup | Unit, parking, garage, exclusive-use areas, participation quota, levies/rates estimates, utility deposits and connection charges. | Buyer identity, seller disclosure. |
| Transaction / offer terms | Purchase price, deposit, irrevocable offer expiry, guarantee deadline, occupation, occupational rent, structured suspensive conditions, accepted commercial terms. | Long-lived party profile facts. |
| Conveyancer / transfer assignment | Transfer attorney, trust account recipient, guarantee requirements, transfer mechanics. | Buyer onboarding facts. |
| Organisation / agent settings | Branding, agency details, agent details, FFC, commission defaults. | Buyer/seller legal status. |
| Legal template registry | Definitions, approved wording, route rules, fallback policy, content scan status. | Raw deal facts. |
| Signing runtime | Signer roles, signature fields, initial fields, spouse/representative/witness routing. | Clause selection without route metadata. |

## Scenario Profile Contract

`resolveLegalDocumentScenarioProfile()` now exposes `otpDocumentVariant` for OTP packets and `buildLegalDocumentScenarioPlaceholders()` emits `otp_document_variant`.

Compatibility rule:

- existing `scenarioKey` remains the party/property/finance scenario key
- existing `templateVariant` behavior remains unchanged for OTP
- new OTP variant routing should use `otpDocumentVariant`

This allows future phases to add variant-aware intake, template routing and launch gates without breaking current scenario matching.

## Variant Detection

The route universe recognises these aliases:

| Input signal | Normalised variant |
| --- | --- |
| `resale`, `existing`, `existing_property`, `normal_sale`, `standard_sale`, `resale_existing_property` | `resale_existing_property` |
| `development`, `development_sale`, `new_development`, `off_plan`, `developer_sale` | `new_development` |

If no development signal exists, OTP defaults to `resale_existing_property` for now. Phase 3 should make the buyer/offer link explicitly variant-aware so this default does not hide uncertainty.

## Phase 2 Blockers Carried Forward

| Priority | Blocker | Next phase |
| --- | --- | --- |
| P0 | Buyer/offer link does not yet require or display the OTP document variant before buyer capture starts. | Phase 3 |
| P0 | Transaction/offer terms do not yet model suspensive conditions, guarantees and occupation as structured records. | Phase 3 |
| P0 | Template routing does not yet require separate approved template routes for resale and new development. | Phase 6/7 |
| P0 | Settings still needs OTP launch readiness, not only routing coverage. | Phase 8 |
| P0 | Runtime still needs hard blocks for variant mismatch and unsafe fallback. | Phase 9 |

## Phase 2 Exit Criteria

Phase 2 is complete when:

1. The OTP route universe has a code-level source of truth.
2. Resale and new-development variants are named and test-covered.
3. Source ownership boundaries are explicit and test-covered.
4. Scenario profiles expose `otpDocumentVariant` without breaking existing scenario keys.
5. The next phase can upgrade buyer/offer intake against the route universe.

