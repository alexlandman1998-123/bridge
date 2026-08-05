# OTP Template vNext Phase 1 Reference Extraction

Generated: 2026-08-05T00:00:00.000Z
Version: otp_reference_extraction_phase1_v1
Status: OTP_REFERENCE_EXTRACTION_READY_FOR_PHASE2
Mutated data: false

## Source

| Field | Value |
| --- | --- |
| Reference | Kingstons 2026 resale OTP reference |
| Path | `/Users/alexanderlandman/Downloads/2026 OTP - Cover Page.docx` |
| SHA-256 | `a1f8f2e82611f44aead9b2f9ac6fdaa19c8577038b17ca1a6666f2cd4e9910cc` |
| Route | `resale_existing_property` |
| Rendered pages | 15 |
| Paragraphs extracted | 416 |
| Embedded media assets | 3 |
| Footer signal | KINGSTONS REAL ESTATE PTY LTD |

## Guardrails

- Do not treat the reference DOCX as a runtime renderer.
- Do not copy unapproved long-form legal wording into live templates from this extraction step.
- Use the extraction as the resale structure, field and shell standard for later counsel-approved native PDF templates.
- Keep new-development extraction separate; resale reference content must not become the development default.

## Branding Requirements

| Requirement | Target rule |
| --- | --- |
| Logo top left | Native PDF shell must render the organisation logo in the top-left brand region with an approved fallback. |
| Company details top right | Native PDF shell must render organisation/agent/contact/document details in the top-right region. |
| Agency name bottom left | Native PDF shell must render agency/trading name in the bottom-left footer region. |
| Page number bottom middle | Native PDF shell must render page number and total-page context in the bottom-middle footer region. |
| Website bottom right | Native PDF shell must render organisation website in the bottom-right footer region. |

## Table Of Contents

| No. | Key | Title | Category |
| --- | --- | --- | --- |
| 1 | `schedule_1` | Schedule 1 | schedule |
| 2 | `schedule_2` | Schedule 2 | schedule |
| 3 | `definitions` | Definitions | legal_clause |
| 4 | `interpretations` | Interpretations | legal_clause |
| 5 | `sale` | Sale | legal_clause |
| 6 | `acceptance` | Acceptance | legal_clause |
| 7 | `purchase_price` | Purchase Price | legal_clause |
| 8 | `the_property` | The Property | legal_clause |
| 9 | `risk` | Risk | legal_clause |
| 10 | `transfer` | Transfer | legal_clause |
| 11 | `occupation` | Occupation | legal_clause |
| 12 | `suspensive_conditions` | Suspensive Conditions | legal_clause |
| 13 | `warranties` | Warranties | legal_clause |
| 14 | `nomination_capacity_parties` | Nomination and Capacity of Parties | legal_clause |
| 15 | `commission` | Commission | legal_clause |
| 16 | `certificates` | Certificates | legal_clause |
| 17 | `rates_taxes_consumption_charges` | Rates, Taxes and Consumption Charges | legal_clause |
| 18 | `breach` | Breach | legal_clause |
| 19 | `cooling_off` | Cooling Off | legal_clause |
| 20 | `domicilium_notices` | Domiciliary / Notices | legal_clause |
| 21 | `consent_to_jurisdiction` | Consent to Jurisdiction | legal_clause |
| 22 | `marital_status_purchaser` | Marital Status of Purchaser | legal_clause |
| 23 | `special_conditions` | Special Conditions | legal_clause |
| 24 | `costs` | Costs | legal_clause |
| 25 | `sale_board` | Sale Board | legal_clause |
| 26 | `whole_agreement` | Whole Agreement | legal_clause |
| 27 | `non_variation` | Non Variation | legal_clause |
| 28 | `non_waiver` | Non Waiver | legal_clause |
| 29 | `severability` | Severability | legal_clause |
| 30 | `applicable_law` | Applicable Law | legal_clause |

## Schedules

| Schedule | Purpose | Captured subsections |
| --- | --- | --- |
| Schedule 1 | Commercial and party fact capture for the resale OTP. | purchaser details; property; homeowners association; offer; suspensive conditions; property to be sold; occupation and occupational rental; guarantee delivery period; fixtures and fittings; special conditions; agent; seller; seller bond details; conveyancing attorneys |
| Schedule 2 | Purchaser acknowledgement and bond-origination fact capture. | purchaser acknowledgement; employment details; bond documents required; bond-origination acknowledgement |

## Field Families

| Family | Owner | Captured fields |
| --- | --- | --- |
| purchaser_identity_capacity | buyer_onboarding | name; ID number; current address; income tax number; VAT number; marital status |
| property_identity | listing_property_record | physical address; erf number; township; homeowners association |
| commercial_offer_terms | transaction_offer_terms | purchase price; deposit; cash contribution; fulfilment date; irrevocable offer date |
| structured_suspensive_conditions | transaction_offer_terms | bond finance amount; subject-sale minimum price; other condition; fulfilment date |
| occupation_rental_guarantees | transaction_offer_terms | occupation after registration; occupational rental from; occupational rental amount; guarantee delivery period |
| fixtures_fittings | seller_onboarding | included fixtures; excluded fixtures; fixture schedule |
| agent_agency_commission | organisation_agent_settings | agency name; agency FFC; agent name; agent FFC; commission |
| seller_identity_admin | seller_onboarding | seller name; seller ID number; seller address; seller VAT number; seller bond details; rates/taxes status |
| conveyancing_attorneys | conveyancer_transfer_assignment | firm; attorney; physical address; telephone number; email address |
| bond_originator_documents | buyer_onboarding | employment type; employer; occupation; income; banking institution; required documents |

## Phase 1 Exit Criteria

- The resale reference is captured as a 30-section structure with legal sections 3-30 explicitly represented.
- The target branded shell requirements are locked before any runtime PDF rebuild.
- Schedule 1 and Schedule 2 data families are mapped to source owners.
- The extraction is route-scoped to resale only and cannot be reused as the new-development OTP standard.
- Later phases must provide counsel-approved wording and native PDF render evidence before launch.

## Verification

```bash
npm run test:otp-reference-extraction-phase1
npm run verify:otp-template-vnext
```
