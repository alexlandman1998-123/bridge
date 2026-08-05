# OTP Template vNext Phase 6 Legal Content Templates

Generated: 2026-08-05T09:56:18.261Z
Version: otp_legal_content_templates_phase6_v1
Status: OTP_LEGAL_CONTENT_READY_FOR_COUNSEL_REVIEW
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| Template sections | 16 |
| Resale sections | 11 |
| New-development sections | 11 |
| Content tokens | 63 |
| Blockers | 0 |
| Warnings | 0 |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE6_BRANDED_SHELL_READY | yes | Legal content templates depend on the Phase 6 branded PDF shell being ready. |
| PHASE6_BOTH_PRIMARY_ROUTES_PRESENT | yes | Legal content templates render both resale and new-development route sets. |
| PHASE6_RESALE_REQUIRED_CLAUSES_PRESENT | yes | Resale OTP includes disclosure, fixtures, subject-to-sale and occupation/rent clauses. |
| PHASE6_DEVELOPMENT_REQUIRED_CLAUSES_PRESENT | yes | New-development OTP includes development unit, handover/snagging and body-corporate compliance clauses. |
| PHASE6_DEVELOPMENT_NOT_RESALE_WORDING | yes | New-development route excludes resale-only disclosure and subject-to-sale clauses. |
| PHASE6_RESALE_NOT_DEVELOPMENT_WORDING | yes | Resale route excludes development-only unit and handover clauses. |
| PHASE6_TOKENS_CANONICAL | yes | Every content token is canonical for OTP. |
| PHASE6_TOKENS_IN_FIELD_REGISTRY_AND_ROUTE | yes | Every content token exists in the OTP field registry for its route. |
| PHASE6_DEFINITIONS_COVER_CLAUSES | yes | Every clause family has the required route-aware definition terms. |
| PHASE6_SOURCE_OWNERS_MATCH_FIELDS | yes | Every content placeholder is backed by its declared source owner. |
| PHASE6_LAYOUT_CONTRACT_ON_EVERY_SECTION | yes | Every content section carries the Phase 6 legal-content layout contract. |
| PHASE6_BLANK_RENDER_RISK_CONTROLLED | yes | Optional legal-content sections have conditions and no placeholder-only lines. |
| PHASE6_CLIENT_HEADINGS_CLEAN | yes | Client-facing section labels and headings avoid internal pack/packet wording. |
| PHASE6_COUNSEL_REVIEW_BOUNDARY_MARKED | yes | Every content section remains marked for legal review before publication. |

## Route Audits

| Route | Sections | Clause Families | Unknown Tokens | Route Field Gaps |
| --- | --- | --- | --- | --- |
| resale_existing_property | 11 | definitions, fixtures_defects_disclosure, occupation_rent, offer_acceptance, parties, property, purchase_price, special_conditions, suspensive_conditions, transfer_conveyancer | 0 | 0 |
| new_development | 11 | body_corporate, definitions, development_defects, development_unit, offer_acceptance, parties, purchase_price, special_conditions, suspensive_conditions, transfer_conveyancer | 0 | 0 |

## Sections

| Order | Section | Variants | Clause Family | Required | Placeholders |
| --- | --- | --- | --- | --- | --- |
| 0 | definitions_shared | resale_existing_property, new_development | definitions | yes |  |
| 10 | development_parties | new_development | parties | yes | buyer_full_name, buyer_id_number, buyer_email, buyer_phone, developer_name, developer_company_registration, agent_full_name, agent_ffc_number, organisation_trading_name |
| 10 | resale_parties | resale_existing_property | parties | yes | buyer_full_name, buyer_id_number, buyer_email, buyer_phone, seller_full_name, seller_id_number, seller_email, seller_phone, agent_full_name, agent_ffc_number, organisation_trading_name |
| 20 | development_unit | new_development | development_unit | yes | development_name, property_unit_number, sectional_plan_status, participation_quota, parking_bay, garage_allocation |
| 20 | resale_property | resale_existing_property | property | yes | property_address, property_title_type |
| 30 | purchase_price | resale_existing_property, new_development | purchase_price | yes | purchase_price, purchase_price_words, deposit_amount, deposit_due_date, trust_account_recipient |
| 31 | development_vat_purchase_price | new_development | purchase_price | yes | vat_inclusive_purchase_price |
| 40 | finance_suspensive_conditions | resale_existing_property, new_development | suspensive_conditions | yes | finance_type, bond_amount, bond_approval_deadline, cash_amount, cash_proof_deadline, guarantee_delivery_deadline, guarantee_delivery_period, irrevocable_offer_expiry, structured_suspensive_conditions |
| 45 | subject_to_sale | resale_existing_property | suspensive_conditions | no | subject_sale_property, subject_sale_minimum_price, subject_sale_fulfilment_date |
| 50 | development_handover | new_development | development_defects | yes | occupation_date, snagging_period_days, contractor_company_name, property_nhbrc_certificate_number |
| 50 | resale_occupation_rent | resale_existing_property | occupation_rent | yes | occupation_date, occupational_rent_payable, occupational_rent_amount |
| 60 | development_compliance_body_corporate | new_development | body_corporate | yes | body_corporate_name, body_corporate_rules_annexure, development_levy_estimate, development_rates_estimate, utility_connection_charges, development_compliance_certificate_schedule |
| 60 | resale_disclosure_fixtures_compliance | resale_existing_property | fixtures_defects_disclosure | yes | mandatory_disclosure_status, mandatory_disclosure_annexure, mandatory_disclosure_comments, fixtures_included, fixtures_excluded, compliance_certificate_schedule |
| 70 | transfer_conveyancer | resale_existing_property, new_development | transfer_conveyancer | yes | transfer_attorney_company_name, transfer_attorney_contact_person, transfer_attorney_email, transfer_attorney_phone, trust_account_recipient, guarantee_delivery_deadline, guarantee_delivery_period |
| 80 | special_conditions_annexures | resale_existing_property, new_development | special_conditions | no | special_conditions, annexures_list |
| 90 | popia_fica | resale_existing_property, new_development | offer_acceptance | yes | buyer_full_name |

## Counsel Review Boundary

Phase 6 provides deterministic legal-content templates for engineering, routing and counsel review. These sections are not a live legal approval, do not publish a template, and must pass the later content scanner, launch-readiness gate and runtime lock before production use.
