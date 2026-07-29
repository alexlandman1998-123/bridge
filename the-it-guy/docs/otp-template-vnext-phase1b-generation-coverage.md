# OTP vNext Phase 1B Generation Coverage Audit

Generated: 2026-07-29T07:20:33.505Z
Status: OTP_GENERATION_COVERAGE_REMEDIATION_REQUIRED
Mutated data: false

## Reference

| Field | Value |
| --- | --- |
| Template | Kingstons 2026 OTP reference template |
| Path | /Users/alexanderlandman/Downloads/2026 OTP - Cover Page.docx |
| Treatment | Used as a standard OTP concept reference; no wording copied into generated templates. |

## Recommendation

| Variant | Route dimensions | Recommendation |
| --- | --- | --- |
| Existing / resale property OTP | buyer_party, seller_party, property_title, finance, occupation, suspensive_conditions | Use this as the primary resale OTP: existing seller, existing title/property facts, property disclosure, fixtures/fittings, seller bond/rates, occupation, guarantees, certificates and transfer obligations. |
| New development OTP | buyer_party, developer_seller, development_unit, finance, occupation_or_handover, development_certificates | Use this as a distinct variant: developer seller, development/unit source data, NHBRC/occupation-certificate/building clauses, parking/storeroom/unit specifications and development-specific annexures. |

## Route Universe

| Dimension | Possibilities |
| --- | --- |
| buyerParty | individual_unmarried, individual_married_in_community, individual_married_out_of_community, individual_customary_marriage, individual_islamic_marriage, individual_foreign_marriage, co_purchasers, company_or_cc, trust, foreign_purchaser |
| sellerParty | individual_unmarried, individual_married_in_community, individual_married_out_of_community, company_or_cc, trust, foreign_seller, developer_seller |
| propertyTitle | full_title_erf, full_title_estate_or_hoa, sectional_title_unit, share_block_or_scheme, agricultural_or_vacant_land, new_development_unit |
| finance | cash, bond, hybrid_cash_and_bond, subject_to_sale_of_purchaser_property, other_suspensive_condition |

## Buyer Onboarding Baseline

| Metric | Value |
| --- | --- |
| Version | buyer_onboarding_flow_v2 |
| Buyer branches | 8: individual, married_coc, married_anc, married_anc_accrual, company, trust, foreign_purchaser, other |
| Purchase modes | 2: individual, co_purchasing |
| Finance branches | 3: cash, bond, hybrid |
| Known onboarding fields | 219 |

## Coverage Summary

| Items | Covered | Partial | Missing |
| --- | --- | --- | --- |
| 22 | 6 | 13 | 3 |

## Coverage Matrix

| Group | Item | Source owner | Status | Gap / recommendation |
| --- | --- | --- | --- | --- |
| Buyer parties | Buyer identity, contact, tax and domicilium details | buyer_onboarding | covered | Keep in buyer onboarding and map cleanly to buyer party rows and domicilium. |
| Buyer parties | Second / multiple purchaser details | buyer_onboarding | partial | Use repeatable purchaser records; OTP signatures and schedules must render all buyers, not only buyer 1/2. |
| Buyer parties | Buyer marital status and regime | buyer_onboarding | partial | Current buyer flow handles in-community and ANC/accrual style paths, but the Kingston schedule calls out customary, Islamic and foreign-law marriage options explicitly. |
| Buyer parties | Company / CC purchaser authority | buyer_onboarding | covered | Keep company authority in buyer onboarding; vNext wording should require resolution evidence and signatory capacity. |
| Buyer parties | Trust purchaser authority | buyer_onboarding | covered | Keep trust route in buyer onboarding; generation must know whether all trustees sign or an authorised trustee signs. |
| Buyer parties | Foreign purchaser facts | buyer_onboarding | partial | Foreign purchaser is detected, but OTP wording still needs a specific route for foreign-law marriage, exchange-control/source-of-funds handling and signatures. |
| Commercial terms | Purchase price, deposit and cash contribution | buyer_onboarding_and_transaction | partial | Purchase price and cash amount are covered; deposit amount, deposit due period and amount-in-words should be treated as transaction/offer terms, not inferred from buyer onboarding. |
| Finance | Bond finance route | buyer_onboarding | covered | Keep bond data in buyer onboarding; OTP wording should use it as a route and amount, not render bank/onboarding admin noise into the agreement. |
| Finance | Bond applicant employment and document checklist | buyer_onboarding | partial | Current finance fields are not clearly repeatable per applicant/co-purchaser, while the Kingston schedule separates applicant 1 and applicant 2. |
| Suspensive conditions | Purchaser's existing property sale condition | otp_terms_capture | missing | Kingston-style OTP has a separate condition for the buyer selling their own property, including property details, minimum sale price and fulfilment date. |
| Suspensive conditions | Other suspensive conditions and fulfilment dates | otp_terms_capture | partial | There is a generic suspensive text field, but no structured condition list with fulfilment dates. |
| Commercial terms | Irrevocable offer date and guarantee delivery period | otp_terms_capture | missing | Current canonical fields do not expose irrevocable offer date or guarantee delivery period. |
| Occupation | Occupation, occupational rental and risk/benefit | otp_terms_capture | partial | Occupation date exists, but occupational rent amount, pre/post-registration occupation choice and risk/benefit treatment are not complete. |
| Property terms | Fixtures, fittings, inclusions and exclusions | seller_property_or_otp_terms | missing | Current OTP registry has no structured inclusion/exclusion list comparable to the Kingston fixtures schedule. |
| Property | Property identity, title type, erf/sectional and HOA | seller_property_listing_or_unit | partial | Merge fields exist, but this should not be buyer onboarding source data; resale and development paths need separate property source contracts. |
| Seller and property admin | Seller details, existing bond, rates/taxes and levies | seller_onboarding | partial | Seller identity fields exist, but Kingston schedule also needs seller bond institution/account/outstanding balance and rates/levies account status. |
| Transfer | Conveyancing attorney details | transaction_assignment | covered | Use transaction/organisation attorney assignment as the source; buyer onboarding should not ask this. |
| Disclosure and warranties | Mandatory disclosure, defects and voetstoots/warranty route | seller_onboarding_disclosure | partial | Disclosure annexure fields exist; fixtures/defect treatment and final disclosure evidence link still need a controlled OTP route. |
| Certificates and costs | Compliance certificates, rates/levies, transfer/bond costs | seller_property_or_otp_terms | partial | Current fields do not fully model electrical, electric fence, gas, occupancy/NHBRC, rates clearance, levies and transfer/bond cost responsibilities. |
| New development | New development unit, developer and construction certificate terms | development_unit_setup | partial | Development merge fields exist, but the legal wording should be a separate new-development OTP variant, not a resale clause patch. |
| Agency | Agent, agency, FFC and commission | agency_transaction | covered | Source from agency/agent/transaction settings; never ask the buyer to supply agency commission or FFC facts. |
| Execution | Buyer, seller, spouse, representative, witness and agent signatures | signing_runtime | partial | Buyer signer data exists for main routes, but signer generation must be route-aware across spouses, co-purchasers, company representatives, trustees, sellers, witnesses and agent/principal. |

## Buyer-Onboarding Field Gaps

| Item | Missing buyer fields | Missing merge fields |
| --- | --- | --- |
| Second / multiple purchaser details |  | buyer_parties |

## Decisions

| Priority | Decision | Reason |
| --- | --- | --- |
| P0 | Create two primary OTP document variants: existing/resale property and new development. | The Kingston resale template and our development unit data need different clause families; trying to hide/show everything in one master template will become brittle. |
| P0 | Keep buyer/seller/property/finance route packs shared across both variants. | Company, trust, individual, spouse consent, full-title/sectional and cash/bond/hybrid logic still applies to both variants. |
| P0 | Buyer onboarding should collect buyer identity/capacity, finance readiness and buyer-side conditions only. | Seller disclosure, seller bond/rates, property title facts, conveyancer assignment, agent/FFC and commission belong to seller/property/transaction/organisation sources. |
| P0 | Add an OTP commercial terms capture step before generation. | Deposit timing, guarantee period, irrevocable offer date, occupation/rent, subject-to-sale and special suspensive dates are offer terms, not stable buyer profile facts. |
| P1 | Expand marital-regime options beyond the current simplified branches. | The Kingston schedule explicitly distinguishes customary, Islamic and foreign-law marriage paths. |
| P1 | Make bond employment/income capture applicant-aware when there are co-purchasers or spouse/joint bond applicants. | The standard OTP schedule separates applicant 1 and applicant 2 bond facts. |

