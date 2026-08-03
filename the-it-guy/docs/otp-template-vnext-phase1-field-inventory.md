# OTP Template vNext Phase 1 Field Inventory

Generated: 2026-08-02
Status: PHASE1_BASELINE_AND_FIELD_INVENTORY_REQUIRES_REMEDIATION
Mutated data: false

## Purpose

Phase 1 establishes the evidence base for bringing OTP generation to the same control level as the mandate generator. It compares:

- Current platform OTP template: `assets/legal-templates/otp_default_v1.docx`
- Current OTP concept audit: `docs/otp-template-vnext-phase1-baseline-concept-audit.md`
- Current OTP generation coverage audit: `docs/otp-template-vnext-phase1b-generation-coverage.md`
- Normal resale reference: `/Users/alexanderlandman/Downloads/2026 OTP - Cover Page.docx`
- New-development reference: `/Users/alexanderlandman/Desktop/Samlin/Junoah Sales/Templates/AGREEMENT OF SALE - final.doc`
- Current buyer offer terms: `src/core/offers/residentialOfferTerms.js`
- Current offer link submission: `src/lib/listingOffersService.js`
- Current OTP draft intake: `src/components/documents/OtpDraftIntakePanel.jsx`

No wording from the reference agreements is copied into templates by this audit. The references are used only to identify concepts, data fields, source ownership and route gaps.

## Phase 1 Decision

OTP must be split into at least two first-class variants:

| Variant | Purpose | Reference |
| --- | --- | --- |
| `resale_existing_property` | Existing property sale between seller and purchaser, with transfer, guarantees, disclosure, fixtures, occupation/rent and compliance certificates. | Kingston normal sale OTP |
| `new_development` | Developer sale of a unit in a development, with VAT, sectional-title creation, contractor/development facts, NHBRC, body corporate, levies, connection charges, occupation/handover and snagging/defect mechanics. | Junoah new-development agreement |

The existing `otp_default_v1` should be treated as a transition/starter template only until the two route-specific templates are built, approved and locked.

## Current OTP Baseline

The committed DOCX is a six-page starter OTP with these visible sections:

1. Offer to Purchase cover/opening
2. Parties
3. Property
4. Purchase price
5. Finance
6. Suspensive conditions
7. Occupation and transfer
8. Fixtures and fittings
9. Capacity and authority
10. Commission
11. Special conditions
12. General terms
13. Signatures

Current strengths:

- Basic buyer, seller, property, purchase price, deposit, finance, commission and signature placeholders exist.
- Current audits already recognise buyer/seller capacity packs, full-title/sectional packs, finance packs and signature routing as necessary concepts.
- Buyer offer flow already captures buyer identity, basic finance terms, subject-to-sale signal, occupation date, fixtures text, special conditions and expiry.

Current blockers:

- The current template is generic and does not distinguish resale from new development.
- Suspensive conditions are mostly free text, not structured conditions.
- Definitions are absent from the actual platform template.
- Occupation/rent, risk, transfer, guarantees, compliance, disclosure, defects and costs are incomplete.
- No OTP-specific content gate currently turns these gaps into publish blockers.
- Settings currently surfaces OTP routing coverage, not full launch readiness.

## Visual Template Baseline

The existing audit says wording changes should preserve a top-left logo and top-right organisation/contact detail block. The actual committed DOCX/PDF does not contain that shell.

Observed actual layout:

| Area | Current state | Required Phase 5 action |
| --- | --- | --- |
| Top-left logo | Missing | Add organisation/development logo block with fallback handling. |
| Top-right details | Missing as a structured block | Add organisation, agent, FFC, contact, document reference and transaction reference block. |
| Header | Simple right-aligned text: `OFFER TO PURCHASE | CONTROLLED LEGAL TEMPLATE` | Replace with controlled branded legal-document header. |
| Footer | Document/transaction reference exists in rendered QA PDF | Preserve and extend with page numbering/status where required. |
| Signature geometry | Basic buyer/seller/witness/agency block | Replace with route-aware signer geometry without ad hoc spacing. |
| Annexure pages | Not meaningfully modelled | Add continuation shell for disclosure, fixture schedules and development annexures. |

Phase 5 must therefore build the production shell, not merely preserve an existing one.

## Current Buyer Offer Link Coverage

Current buyer offer terms capture:

| Bucket | Current captured fields | Phase 1 finding |
| --- | --- | --- |
| Buyer identity | full name, email, phone, ID number | Useful but not enough for all buyer capacity routes. |
| Buyer capacity | purchaser type, purchaser entity name | Needs stronger company, trust, spouse, co-purchaser and foreign purchaser structure. |
| Finance | offer amount, deposit amount, finance type, bond amount, cash contribution, bond assistance, proof/pre-approval refs, deposit due date, bond approval deadline | Good base; must add guarantee deadline, cash proof deadline and applicant-aware bond capture. |
| Offer terms | expiry date/time, occupation date, occupational rent flag/amount, subject-to-sale flag, fixtures text | Must become variant-aware and more structured. |
| Conditions | suspensive conditions and special conditions free text | Must become controlled repeatable condition records with review state. |
| Acknowledgements | seller review, legal disclaimer, info accuracy | Must add route-specific acknowledgements, especially for new development. |

Required change: the buyer link should know the intended OTP variant before the buyer starts. The buyer should not be asked to provide seller, developer, conveyancer, commission, title, compliance or disclosure facts.

## Field Inventory By Concept

### 1. Buyer And Purchaser Capacity

| Field family | Current | Resale reference needs | Development reference needs | Owner | Gap/action |
| --- | --- | --- | --- | --- | --- |
| Buyer identity/contact | Partial | Purchaser 1 and 2 details, domicilium, ID/passport | Purchaser 1 and 2 details, domicilium, tax references where applicable | Buyer onboarding | Make buyer parties repeatable, not buyer 1/2 hardcoded. |
| Marital regime | Partial | Unmarried, in community, ANC, customary, Islamic, foreign-law marriage | Same capacity/signature implications | Buyer onboarding | Expand marital-regime enum and signer rules. |
| Co-purchasers | Partial | Multiple purchasers and signatures | Multiple purchasers and signatures | Buyer onboarding/signing runtime | Render all purchasers and ownership shares where captured. |
| Company/CC purchaser | Partial | Registration, representative, resolution, surety/authority | Same, plus development acknowledgements | Buyer onboarding | Require authority evidence and representative capacity. |
| Trust purchaser | Partial | Trust registration, trustees, authority | Same | Buyer onboarding | Decide whether all trustees sign or authorised trustee signs. |
| Foreign purchaser | Partial | Foreign-law marriage/source-of-funds/exchange-control style route | Same plus development acknowledgements | Buyer onboarding/compliance | Add route-specific requirements and warnings. |

### 2. Seller, Developer And Contractor

| Field family | Current | Resale reference needs | Development reference needs | Owner | Gap/action |
| --- | --- | --- | --- | --- | --- |
| Seller identity/contact | Partial | Seller details, marital/entity capacity, spouse/authority | Developer seller legal identity and authorised signatory | Seller onboarding/development setup | Split normal seller from developer seller. |
| Seller bond/rates | Missing | Bond institution/account/outstanding, rates/taxes/levies status | Not primary, development has different cost/levy logic | Seller onboarding/property admin | Add seller-owned resale admin fields. |
| Developer | Missing | Not applicable | Developer/seller, contractor, architect, land surveyor where used | Development setup | Add development owner/source contract. |
| Contractor/building party | Missing | Not applicable | Contractor/building warranty/NHBRC related facts | Development setup | Add contractor/development legal metadata. |

### 3. Property, Title And Unit Facts

| Field family | Current | Resale reference needs | Development reference needs | Owner | Gap/action |
| --- | --- | --- | --- | --- | --- |
| Address/erf/unit | Partial | Physical address, erf, township, title type, sectional/full title | Scheme, section/unit, undivided share, common property | Listing/property/development unit | Separate resale title facts from development unit facts. |
| Sectional title | Partial | Section number, scheme, unit | Sectional plan, section, participation quota, common property | Property/development setup | Add section plan/register status. |
| Parking/garage/storeroom | Missing | Optional fixtures/rights | Parking bay, garage, exclusive-use areas | Development unit setup | Add as structured unit entitlements. |
| HOA/body corporate | Partial | HOA/sectional levies where applicable | Body corporate, rules, levies | Property/development setup | Add acknowledgement and annexure route. |

### 4. Purchase Price, Deposits And Payment

| Field family | Current | Resale reference needs | Development reference needs | Owner | Gap/action |
| --- | --- | --- | --- | --- | --- |
| Purchase price | Covered | Amount and amount in words | VAT-inclusive price | Transaction/offer terms | Add amount-in-words and VAT basis. |
| Deposit | Partial | Deposit amount and due date | Security deposit, further deposit, trust account recipient | Offer terms/conveyancer/development | Add recipient, due dates and trust-account routing. |
| Guarantees | Missing | Guarantee delivery period/deadline | Guarantees/shortfall after lower bond approval | Conveyancer/offer terms | Add guarantee deadline and shortfall mechanics. |
| Cash contribution | Partial | Cash from own funds/proceeds and fulfilment date | Shortfall/cash payment guarantee | Buyer offer terms | Add cash proof and payment deadline. |

### 5. Finance And Suspensive Conditions

Structured suspensive conditions are a Phase 1 P0 gap.

Required condition record:

| Field | Purpose |
| --- | --- |
| `condition_type` | bond, subject_to_sale, cash_proof, guarantee, development_condition, other |
| `condition_beneficiary` | buyer, seller, both |
| `amount` | Condition amount where relevant. |
| `fulfilment_deadline` | Exact date/deadline. |
| `responsible_party` | Party responsible for fulfilment. |
| `waivable_by` | Party who may waive the condition. |
| `lapse_consequence` | What happens if not fulfilled or waived. |
| `approved_wording` | Counsel/agent-approved rendered wording. |
| `review_status` | draft, agent_review_required, legal_review_required, approved. |

Reference-driven required conditions:

| Condition | Current | Resale requirement | Development requirement | Owner | Gap/action |
| --- | --- | --- | --- | --- | --- |
| Bond approval | Partial | Bond amount and fulfilment date | Mortgage loan deadline, extension, lesser-loan shortfall | Buyer onboarding/offer terms | Make structured and deadline-aware. |
| Subject-to-sale | Partial/free text | Purchaser property, minimum price, fulfilment date | Usually not core but may be allowed by route | Offer terms | Add structured subject-sale object. |
| Other suspensive condition | Partial/free text | Condition text and fulfilment date | Development-specific conditions where approved | Offer terms/legal review | Require review before generation. |
| Cash proof | Partial | Cash contribution/source/proof deadline | Shortfall proof/guarantee | Buyer finance | Add proof deadline and review state. |
| Guarantee delivery | Missing | Delivery period/deadline | Delivery/shortfall mechanics | Conveyancer/offer terms | Add as first-class OTP term. |

### 6. Occupation, Rent, Risk And Handover

| Field family | Current | Resale reference needs | Development reference needs | Owner | Gap/action |
| --- | --- | --- | --- | --- | --- |
| Occupation date | Covered | Occupation date or after registration | Occupation/handover date, practical occupation mechanics | Offer terms/development | Split resale occupation from development handover. |
| Occupational rent | Partial | Rent amount, from date, pro-rata and no-tenancy treatment | Occupation obligations before transfer | Offer terms | Add amount, start, due basis and risk treatment. |
| Risk/benefit | Thin | Risk from occupation or registration as agreed | Occupation before transfer restrictions and risk | Legal template/offer terms | Add route-aware controlled wording. |

### 7. Fixtures, Fittings, Defects And Disclosure

| Field family | Current | Resale reference needs | Development reference needs | Owner | Gap/action |
| --- | --- | --- | --- | --- | --- |
| Fixtures included/excluded | Partial/free text | Structured schedule of inclusions/exclusions | Mostly unit specifications/annexures | Seller/property or offer terms | Add structured list plus free-text review. |
| Mandatory disclosure | Partial | Disclosure annexure/status | Not same route; development uses specifications/NHBRC/body corporate docs | Seller disclosure/development docs | Carry annexure evidence into OTP. |
| Defects | Missing | Defect disclosure/voetstoots route | Snag list, defect window, NHBRC process | Seller disclosure/development setup | Add resale defect route and development snagging route. |

### 8. Compliance, Costs And Certificates

| Field family | Current | Resale reference needs | Development reference needs | Owner | Gap/action |
| --- | --- | --- | --- | --- | --- |
| Certificates | Missing | Electrical, gas, electric fence, occupancy if applicable | NHBRC, occupancy/sectional/development certificates | Seller/property/development | Add certificate schedule and responsibility. |
| Transfer/bond costs | Thin | Purchaser transfer/bond cost acknowledgement | Seller may pay transfer/bond costs in development, depending template | Conveyancer/legal template | Route-specific cost wording. |
| Rates/levies/charges | Missing | Rates, levies, consumption charges | Estimated levies/rates, utility deposits, connection charges | Seller/property/development | Add structured fields and owner. |

### 9. Transfer, Conveyancer And Trust Account

| Field family | Current | Resale reference needs | Development reference needs | Owner | Gap/action |
| --- | --- | --- | --- | --- | --- |
| Conveyancer | Partial | Conveyancing attorney details | Tuckers/conveyancer trust mechanics in reference | Transaction assignment/conveyancer | Add required conveyancer route before generation. |
| Transfer timing | Thin | Transfer after guarantees and compliance | Transfer after sectional register and price secured | Conveyancer/development | Add variant-specific wording and data. |
| Trust account | Missing | Deposit trust handling where used | Deposit recipient/reference/trust account | Conveyancer | Add trusted payment recipient fields. |

### 10. Agency, Commission And Branding

| Field family | Current | Resale reference needs | Development reference needs | Owner | Gap/action |
| --- | --- | --- | --- | --- | --- |
| Agent/agency/FFC | Covered/partial | Agent, agency, FFC | Selling/listing agent and VAT/tax fields where relevant | Organisation/agent/transaction | Keep out of buyer link. |
| Commission | Partial | Commission amount/percentage/payability | Agency VAT/commission details | Transaction/commission settings | Keep route-aware and approved. |
| Branding | Missing in DOCX shell | Logo and organisation details expected | Development/agency branding may differ | Organisation/development | Add top-left logo/top-right details shell. |

### 11. Definitions, Annexures And Schedules

| Field family | Current | Resale reference needs | Development reference needs | Owner | Gap/action |
| --- | --- | --- | --- | --- | --- |
| Definitions | Missing | Agreement, Agent, Conveyancer, Deposit, Fixtures, Guarantee Delivery Period, Occupation Date, Occupational Rental, Purchase Price, Property, Purchaser, Seller, Suspensive Conditions, VAT | Act, Architect, Body Corporate, Common Property, Contractor, Development, NHBRC, Participation Quota, Rules, Sectional Plan, Unit, VAT | Legal template | Add definition catalog and clause-to-definition scanner. |
| Annexures | Partial | Disclosure, fixtures, special conditions, FICA/docs | Sectional plan, rules, specs, NHBRC, development annexures | Source document owners | Add annexure registry with required/optional status. |
| Schedules | Weak | Commercial schedule first pages | Development unit/payment/cost schedule | Template shell/legal template | Build schedule-style pages before terms. |

### 12. Signatures

| Field family | Current | Resale reference needs | Development reference needs | Owner | Gap/action |
| --- | --- | --- | --- | --- | --- |
| Buyer/seller signatures | Basic | All purchasers, seller, spouses/representatives, witness, agent | Purchaser(s), developer/seller authorised signatory, selling agent | Signing runtime | Add route-aware signer matrix. |
| Initials | Basic | Initial every page or as signing policy requires | Same | Signing runtime | Preserve signature geometry and initial routing. |
| Authority signers | Partial | Company/trust authorised signers | Developer/entity signers | Signing runtime/legal route | Tie authority route to signer generation. |

## Required Source Ownership Map

| Source | Owns | Must not own |
| --- | --- | --- |
| Buyer onboarding / buyer offer link | Buyer identity, buyer capacity, finance readiness, buyer-side conditions, buyer acknowledgements. | Seller facts, developer facts, conveyancer facts, agent FFC, commission, title facts. |
| Seller onboarding | Seller identity, seller capacity, disclosure, defects, seller bond/rates, seller-side fixtures/certificates. | Buyer finance or buyer conditions. |
| Listing/property record | Property address, erf/unit/title type, HOA/sectional facts, fixtures metadata where seller-approved. | Legal wording. |
| Development setup | Development, developer seller, unit, scheme, parking/garage, VAT basis, levies/rates estimates, connection charges, NHBRC, rules/specifications. | Buyer identity or buyer finance. |
| Transaction/offer terms | Price, deposit, occupation, expiry, condition records, accepted commercial terms. | Long-lived party profile facts. |
| Conveyancer/transfer assignment | Transfer attorney, trust account recipient, guarantee requirements, transfer mechanics. | Buyer onboarding facts. |
| Organisation/agent settings | Branding, agency details, agent details, FFC, commission defaults. | Buyer/seller legal status. |
| Legal template registry | Definitions, approved wording, route rules, fallback policy, content scan status. | Raw deal facts. |
| Signing runtime | Signer roles, signature fields, initials, spouse/representative/witness routing. | Clause selection decisions without route metadata. |

## Phase 1 Blockers To Carry Forward

| Priority | Blocker | Why it matters | Next phase |
| --- | --- | --- | --- |
| P0 | OTP variant is not first-class at the buyer link/intake boundary. | New-development and resale transactions need different fields and legal clauses. | Phase 2/3 |
| P0 | Suspensive conditions are not structured. | Free text cannot safely drive legal generation or deadline logic. | Phase 3/4 |
| P0 | Definitions are missing from the actual OTP template. | Reference agreements rely on controlled definitions; scanner must enforce them. | Phase 4/7 |
| P0 | Branded shell is missing from the committed template. | The expected logo/details layout is not present and cannot be "preserved". | Phase 5 |
| P0 | Occupation/rent/risk/transfer/guarantee fields are incomplete. | These are core OTP commercial and legal terms. | Phase 3/6 |
| P0 | Disclosure, fixtures, defects and compliance certificates are not enforceable. | Resale OTP cannot launch safely without these routes. | Phase 4/6/7 |
| P0 | Development-specific facts are not complete. | Junoah-style transactions need VAT, development, unit, NHBRC, body corporate and snagging data. | Phase 2/3/6 |
| P0 | OTP launch readiness is not equivalent to mandate readiness. | Routing coverage is not sufficient launch evidence. | Phase 7/8 |
| P0 | OTP fallback approval enforcement needs explicit tests. | The mandate incident showed comments are not enforcement. | Phase 7/9 |

## Phase 1 Exit Criteria

Phase 1 is complete when this inventory is accepted as the implementation baseline and the next phase can proceed with these constraints:

1. Build two first-class OTP variants: resale and new development.
2. Do not expand buyer onboarding into a dumping ground for all OTP data.
3. Convert suspensive conditions, guarantees, occupation/rent and special conditions into structured records with review status.
4. Add a canonical OTP merge-field registry with source ownership and definition mapping.
5. Build a production branded OTP shell because the current DOCX does not contain the expected logo/details layout.
6. Turn advisory OTP gaps into publish and runtime blockers before launch.
7. Run live `otp_default_v1` audit before any corrective migration.

