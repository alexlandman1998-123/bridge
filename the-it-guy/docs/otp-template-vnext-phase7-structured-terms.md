# OTP Template vNext Phase 7 Structured Terms

Generated: 2026-08-05T09:51:21.211Z
Version: otp_structured_terms_phase7_v1
Record contract: otp_structured_terms_record_phase7_v1
Status: OTP_STRUCTURED_TERMS_READY_FOR_RENDERER_WIRING
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| Structured term groups | 11 |
| Resale groups | 8 |
| New-development groups | 8 |
| Unique structured fields | 39 |
| Blockers | 0 |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE7_STRUCTURED_TERMS_BOTH_ROUTES_PRESENT | yes | Structured terms resolve both resale and new-development routes. |
| PHASE7_RESALE_TERMS_STAY_RESALE_ONLY | yes | Resale occupation, subject-to-sale and disclosure terms stay out of the development route. |
| PHASE7_DEVELOPMENT_TERMS_STAY_DEVELOPMENT_ONLY | yes | Development VAT, handover and levy terms stay out of the resale route. |
| PHASE7_STRUCTURED_TERMS_IN_FIELD_REGISTRY | yes | Every structured term field is registered. |
| PHASE7_STRUCTURED_TERMS_ROUTE_ELIGIBLE | yes | Every structured term field is route eligible. |
| PHASE7_STRUCTURED_TERMS_HAVE_SOURCE_PATHS | yes | Every structured term has a source path. |
| PHASE7_STRUCTURED_TERMS_BOUND_TO_LEGAL_SECTIONS | yes | Every structured term group is bound to a route legal section. |
| PHASE7_NO_FREE_TEXT_TERM_FALLBACKS | yes | Structured commercial terms do not allow free-text renderer fallbacks. |
| PHASE7_BUYER_ONBOARDING_NOT_TERMS_SOURCE | yes | Buyer onboarding does not own structured OTP commercial terms. |
| PHASE7_SUSPENSIVE_CONDITIONS_ARE_REPEATABLE_RECORDS | yes | Suspensive conditions are repeatable structured records with approved condition types. |

## Route Manifests

| Route | Groups | Fields | Source Owners | Boundary |
| --- | --- | --- | --- | --- |
| Existing / resale property OTP | purchase_economics, finance_and_guarantees, structured_suspensive_conditions, offer_validity, transfer_conveyancer, resale_subject_to_sale, resale_occupation_rent, resale_disclosure_fixtures | purchase_price, purchase_price_words, deposit_amount, deposit_due_date, trust_account_recipient, finance_type, bond_amount, bond_approval_deadline, cash_amount, cash_proof_deadline, guarantee_delivery_deadline, guarantee_delivery_period, structured_suspensive_conditions, irrevocable_offer_expiry, transfer_attorney_company_name, transfer_attorney_contact_person, transfer_attorney_email, transfer_attorney_phone, subject_sale_property, subject_sale_minimum_price, subject_sale_fulfilment_date, occupation_date, occupational_rent_payable, occupational_rent_amount, mandatory_disclosure_status, mandatory_disclosure_annexure, mandatory_disclosure_comments, fixtures_included, fixtures_excluded, compliance_certificate_schedule | transaction_offer_terms, conveyancer_transfer_assignment, seller_onboarding | structured_terms_only_no_free_text_fallback |
| New development OTP | purchase_economics, finance_and_guarantees, structured_suspensive_conditions, offer_validity, transfer_conveyancer, development_vat_pricing, development_handover, development_levies_and_compliance | purchase_price, purchase_price_words, deposit_amount, deposit_due_date, trust_account_recipient, finance_type, bond_amount, bond_approval_deadline, cash_amount, cash_proof_deadline, guarantee_delivery_deadline, guarantee_delivery_period, structured_suspensive_conditions, irrevocable_offer_expiry, transfer_attorney_company_name, transfer_attorney_contact_person, transfer_attorney_email, transfer_attorney_phone, vat_inclusive_purchase_price, occupation_date, snagging_period_days, contractor_company_name, property_nhbrc_certificate_number, body_corporate_rules_annexure, development_levy_estimate, development_rates_estimate, utility_connection_charges, development_compliance_certificate_schedule | transaction_offer_terms, conveyancer_transfer_assignment, development_setup, development_unit_setup | structured_terms_only_no_free_text_fallback |

## Boundary

Phase 7 locks structured OTP commercial terms and condition records. It does not render the final PDF, approve counsel wording, mutate source data, or replace the later renderer visual QA phase.
