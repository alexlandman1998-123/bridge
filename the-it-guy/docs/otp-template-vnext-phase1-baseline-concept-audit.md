# OTP Template vNext Phase 1 Baseline + Concept Audit

Generated: 2026-07-29T07:03:55.280Z
Status: OTP_VNEXT_CONCEPT_REMEDIATION_REQUIRED
Mutated data: false

## Template

| Field | Value |
| --- | --- |
| Template ID | ebabea7f-67c1-4160-95ee-7833db98d061 |
| Template key | otp_default_v1 |
| Label | Offer to Purchase · Arch9 Starter |
| Status | published |
| Active/default | yes / yes |
| Version tag | v2 |

## Visual Baseline

| Metric | Value |
| --- | --- |
| Sections | 25 |
| Required sections | 10 |
| Conditional sections | 14 |
| Signature sections | 1 |
| Total wording word count | 719 |

Section sequence:

1. cover_page
2. buyer_details
3. seller_details
4. purchase_terms
5. parties
6. buyer_individual_capacity_pack
7. buyer_company_authority_pack
8. buyer_trust_authority_pack
9. buyer_spouse_consent_pack
10. seller_individual_capacity_pack
11. seller_company_authority_pack
12. seller_trust_authority_pack
13. seller_spouse_consent_pack
14. property_details
15. property_full_title_pack
16. property_sectional_title_pack
17. bond_finance_pack
18. cash_sale_pack
19. cash_contribution_pack
20. commission_terms
21. purchase_price
22. suspensive_conditions
23. special_conditions
24. general_terms
25. signature_pages

Layout preservation notes:

- Use this OTP section sequence as the Phase 1 baseline before vNext wording changes.
- Preserve the existing top-left logo, top-right organisation/contact detail block and footer treatment during wording changes.
- Keep signature geometry stable; route-aware extra signers should be added through signing layout rules, not ad hoc PDF spacing.
- Tighten wording in compact sections so the current polished PDF rhythm is preserved and improved rather than reset.

## Section Inventory

| Order | Key | Label | Rendered heading | Type | Required | Conditional | Fields | Words |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | cover_page | Cover Page | OFFER TO PURCHASE | legal_text | yes | no | 5 | 43 |
| 1 | buyer_details | Buyer Details | PURCHASER | dynamic_fields | yes | no | 5 | 15 |
| 2 | seller_details | Seller Details | SELLER | dynamic_fields | yes | no | 5 | 15 |
| 4 | purchase_terms | Purchase Terms | PURCHASE PRICE | dynamic_fields | yes | no | 5 | 35 |
| 5 | parties | Parties | PURCHASER | dynamic_fields | yes | no | 10 | 30 |
| 10 | buyer_individual_capacity_pack | Buyer Individual Capacity Pack | PURCHASER INDIVIDUAL CAPACITY | legal_text | no | yes | 3 | 29 |
| 11 | buyer_company_authority_pack | Buyer Company Authority Pack | PURCHASER COMPANY AUTHORITY | legal_text | no | yes | 6 | 37 |
| 12 | buyer_trust_authority_pack | Buyer Trust Authority Pack | PURCHASER TRUST AUTHORITY | legal_text | no | yes | 6 | 33 |
| 13 | buyer_spouse_consent_pack | Buyer Spouse Consent Pack | PURCHASER SPOUSE CONSENT | legal_text | no | yes | 4 | 24 |
| 20 | seller_individual_capacity_pack | Seller Individual Capacity Pack | SELLER INDIVIDUAL CAPACITY | legal_text | no | yes | 3 | 29 |
| 21 | seller_company_authority_pack | Seller Company Authority Pack | SELLER COMPANY AUTHORITY | legal_text | no | yes | 6 | 37 |
| 22 | seller_trust_authority_pack | Seller Trust Authority Pack | SELLER TRUST AUTHORITY | legal_text | no | yes | 6 | 33 |
| 23 | seller_spouse_consent_pack | Seller Spouse Consent Pack | SELLER SPOUSE CONSENT | legal_text | no | yes | 4 | 24 |
| 35 | property_details | Property | PROPERTY | dynamic_fields | yes | no | 12 | 31 |
| 40 | property_full_title_pack | Full Title Property Pack | FULL TITLE PROPERTY DETAILS | legal_text | no | yes | 5 | 17 |
| 41 | property_sectional_title_pack | Sectional Title Property Pack | SECTIONAL TITLE PROPERTY DETAILS | legal_text | no | yes | 6 | 20 |
| 50 | bond_finance_pack | Bond Finance Pack | BOND FINANCE | legal_text | no | yes | 2 | 24 |
| 51 | cash_sale_pack | Cash Sale Payment Pack | CASH SALE PAYMENT REQUIREMENTS | legal_text | no | yes | 2 | 23 |
| 52 | cash_contribution_pack | Combination Finance Cash Contribution Pack | CASH CONTRIBUTION | legal_text | no | yes | 3 | 32 |
| 61 | commission_terms | Commission Terms | COMMISSION | dynamic_fields | yes | no | 5 | 34 |
| 63 | purchase_price | Purchase Price | PURCHASE PRICE | dynamic_fields | yes | no | 5 | 35 |
| 66 | suspensive_conditions | Suspensive Conditions | SUSPENSIVE CONDITIONS | dynamic_fields | no | yes | 3 | 32 |
| 80 | special_conditions | Special Conditions | SPECIAL CONDITIONS | dynamic_fields | no | no | 2 | 5 |
| 81 | general_terms | General Legal Terms | GENERAL TERMS | legal_text | yes | no | 1 | 56 |
| 100 | signature_pages | Signature Pages | SIGNATURES | signature_zone | yes | no | 11 | 26 |

## Concept Coverage

Total: 12; covered: 7; partial: 2; missing: 3

| Concept | Status | Matched fields | Recommendation |
| --- | --- | --- | --- |
| Offer, acceptance and deed-of-sale framework | covered |  | Make the opening wording clearly explain that the OTP becomes a deed of sale once accepted in writing, and that schedules, standard terms, special conditions and annexures form one agreement. |
| Buyer and seller capacity / authority | covered | buyer_representative_name, buyer_representative_capacity, seller_representative_name, seller_representative_capacity | Keep conditional company, trust and spouse-consent routes, but ensure the legal text requires authority evidence instead of simply rendering empty factual rows. |
| Property identification | covered | property_address, property_unit_number, erf_number, property_section_number, sectional_title_number | Confirm whether OTP vNext needs separate full-title and sectional-title property sections, rather than a single generic property block. |
| Purchase economics | covered | purchase_price, deposit_amount, bond_amount, cash_amount | Separate fixed payment wording from factual commercial values: purchase price, deposit, bond/cash split, guarantees and payment deadlines. |
| Finance and suspensive conditions | covered | finance_type, bond_amount, cash_amount, suspensive_conditions | Model bond, cash and hybrid finance as routes; only special finance wording should remain editable/free-text. |
| Occupation and occupational rent | missing |  | Add a controlled occupation clause with occupation date, occupational rent and risk/benefit treatment where applicable. |
| Transfer and conveyancer | partial |  | Confirm transfer attorney nomination, transfer timing and buyer cooperation obligations in the OTP wording. |
| Mandatory disclosure annexure | partial |  | Carry the signed mandatory disclosure form into the OTP as an annexure/status reference without making blank merge fields visible. |
| Fixtures, fittings and defects | missing |  | Decide whether fixtures/fittings and defect disclosure are standard text, annexure-driven, or special-condition driven. |
| Compliance certificates, costs and risk | missing |  | Add controlled wording for compliance certificates, rates/levies, transfer costs and risk allocation. |
| Special conditions and annexures | covered | special_conditions, annexures_list | Keep special conditions, but require an approved empty-state or hide the section when no special conditions are captured. |
| Signature and execution | covered | buyer_full_name, seller_full_name | Preserve the current signing layout while ensuring all required buyer, seller, spouse and representative signature roles are route-aware. |

## Merge Fields

Total: 72; canonical: 70; alias/non-canonical: 2; unknown: 0

| Token | Canonical | Status | Source | Sections |
| --- | --- | --- | --- | --- |
| agency_commission_amount | agency_commission_amount | canonical | transactions.agency_commission_amount | commission_terms |
| agent_commission_amount | agent_commission_amount | canonical | transactions.agent_commission_amount | commission_terms |
| agent_ffc_number | agent_ffc_number | canonical | agent profile mapping or lead assignment fields | signature_pages |
| agent_full_name | agent_full_name | canonical | transactions.assigned_agent OR lead assignment fields | cover_page, signature_pages |
| annexures_list | annexures_list | canonical | mandate draft or onboarding annexuresList | special_conditions |
| bond_amount | bond_amount | canonical | transactions.bond_amount | purchase_terms, bond_finance_pack, cash_contribution_pack, purchase_price, suspensive_conditions |
| buyer_authority_basis | buyer_authority_basis | canonical | onboarding_form_data.authorityBasis | buyer_company_authority_pack, buyer_trust_authority_pack |
| buyer_company_registration_number | buyer_company_registration_number | canonical | onboarding_form_data.companyRegistrationNumber | buyer_company_authority_pack |
| buyer_email | buyer_email | canonical | buyers.email OR onboarding_form_data.email | buyer_details, parties |
| buyer_entity_type | buyer_entity_type | canonical | transactions.purchaser_type OR onboarding_form_data.purchaserType | buyer_details, parties, buyer_individual_capacity_pack, buyer_company_authority_pack, buyer_trust_authority_pack |
| buyer_full_name | buyer_full_name | canonical | buyers.name OR onboarding_form_data.firstName/lastName | buyer_details, parties, signature_pages |
| buyer_id_number | buyer_id_number | canonical | onboarding_form_data.idNumber OR companyRegistrationNumber OR trustRegistrationNumber | buyer_details, parties |
| buyer_initials | buyer_initials | canonical | document_signing_fields | signature_pages |
| buyer_marital_status | buyer_marital_status | canonical | onboarding_form_data.maritalStatus | buyer_individual_capacity_pack |
| buyer_phone | buyer_phone | canonical | buyers.phone OR onboarding_form_data.phone | buyer_details, parties |
| buyer_representative_capacity | buyer_representative_capacity | canonical | onboarding_form_data.authorizedRepresentativeCapacity | buyer_company_authority_pack, buyer_trust_authority_pack |
| buyer_representative_name | buyer_representative_name | canonical | onboarding_form_data.authorizedRepresentativeName | buyer_company_authority_pack, buyer_trust_authority_pack |
| buyer_resolution_date | buyer_resolution_date | canonical | onboarding_form_data.resolutionDate | buyer_company_authority_pack |
| buyer_signature | buyer_signature | canonical | document_signing_fields | signature_pages |
| buyer_spouse_consent_required | buyer_spouse_consent_required | canonical | derived from buyer marital status/regime or onboarding spouse consent flag | buyer_individual_capacity_pack, buyer_spouse_consent_pack |
| buyer_spouse_email | buyer_spouse_email | canonical | onboarding_form_data.spouseEmail | buyer_spouse_consent_pack |
| buyer_spouse_full_name | buyer_spouse_full_name | canonical | onboarding_form_data.spouseName | buyer_spouse_consent_pack |
| buyer_spouse_id_number | buyer_spouse_id_number | canonical | onboarding_form_data.spouseIdNumber | buyer_spouse_consent_pack |
| buyer_trust_registration_number | buyer_trust_registration_number | canonical | onboarding_form_data.trustRegistrationNumber | buyer_trust_authority_pack |
| buyer_trustee_names | buyer_trustee_names | canonical | onboarding_form_data.trusteeNames | buyer_trust_authority_pack |
| cash_amount | cash_amount | canonical | derived from price/deposit/bond if available | purchase_terms, cash_sale_pack, cash_contribution_pack, purchase_price |
| deposit_amount | deposit_amount | canonical | transactions.deposit_amount | purchase_terms, purchase_price |
| document_reference | document_reference | canonical | document_packets.id / template key | cover_page, general_terms |
| erf_number | erf_number | canonical | unit metadata or onboarding data | property_details, property_full_title_pack |
| erf_size | erf_size | canonical | seller onboarding erfSize OR listing/property facts | property_full_title_pack |
| finance_type | finance_type | canonical | transactions.finance_type | purchase_terms, bond_finance_pack, cash_sale_pack, cash_contribution_pack, purchase_price, suspensive_conditions |
| floor_size | floor_size | canonical | seller onboarding floorSize OR listing/property facts | property_full_title_pack |
| gross_commission_amount | gross_commission_amount | canonical | transactions.gross_commission_amount or derived from purchase price | commission_terms |
| gross_commission_percentage | gross_commission_percentage | canonical | transactions.gross_commission_percentage | commission_terms |
| organisation_name | organisation_trading_name | alias_or_noncanonical | organisations.display_name OR organisation trading-name settings | cover_page, commission_terms, signature_pages |
| property_address | property_address | canonical | transactions.property_address_line_1 OR onboarding property address | cover_page, property_details |
| property_city | property_city | canonical | transactions.city OR onboarding city | property_details |
| property_complex_name | property_complex_name | canonical | seller onboarding schemeName OR estateComplexName | property_details, property_sectional_title_pack |
| property_display_address | property_display_address | canonical | seller onboarding property address plus sectional title / estate details | property_details |
| property_estate_name | property_estate_name | canonical | seller onboarding estateName OR estateComplexName | property_details, property_full_title_pack, property_sectional_title_pack |
| property_section_number | property_section_number | canonical | seller onboarding sectionNumber OR canonical property facts | property_details, property_sectional_title_pack |
| property_suburb | property_suburb | canonical | transactions.suburb OR development suburb | property_details |
| property_title_type | property_title_type | canonical | seller onboarding propertyStructureType OR normalized property facts | property_full_title_pack, property_sectional_title_pack |
| property_type | property_type | canonical | transactions.property_type OR listing/onboarding property type | property_details |
| property_unit_number | property_unit_number | canonical | seller onboarding unitNumber OR listing unit number | property_details, property_sectional_title_pack |
| purchase_price | purchase_price | canonical | transactions.purchase_price OR sales_price | purchase_terms, purchase_price |
| sectional_title_number | sectional_title_number | canonical | unit metadata or seller onboarding scheme details | property_details, property_sectional_title_pack |
| seller_authority_basis | seller_authority_basis | canonical | seller onboarding authorityBasis | seller_company_authority_pack, seller_trust_authority_pack |
| seller_company_registration_number | seller_company_registration_number | canonical | seller onboarding companyRegistrationNumber OR seller registration number | seller_company_authority_pack |
| seller_email | seller_email | canonical | lead.sellerEmail OR mandate draft | seller_details, parties |
| seller_entity_type | seller_entity_type | canonical | seller onboarding ownership type | seller_details, parties, seller_individual_capacity_pack, seller_company_authority_pack, seller_trust_authority_pack |
| seller_full_name | seller_full_name | canonical | lead.sellerName/sellerSurname OR lead.name OR development owner | seller_details, parties, signature_pages |
| seller_id_number | seller_id_number | canonical | seller onboarding form data or transaction fields | seller_details, parties |
| seller_initials | seller_initials | canonical | document_signing_fields | signature_pages |
| seller_marital_status | seller_marital_status | canonical | seller onboarding maritalStatus | seller_individual_capacity_pack |
| seller_phone | seller_phone | canonical | lead.sellerPhone OR onboarding form | seller_details, parties |
| seller_representative_capacity | seller_representative_capacity | canonical | seller onboarding authorized representative capacity | seller_company_authority_pack, seller_trust_authority_pack |
| seller_representative_name | seller_representative_name | canonical | seller onboarding authorized representative fields | seller_company_authority_pack, seller_trust_authority_pack |
| seller_resolution_date | seller_resolution_date | canonical | seller onboarding resolutionDate | seller_company_authority_pack |
| seller_signature | seller_signature | canonical | document_signing_fields | signature_pages |
| seller_spouse_consent_required | seller_spouse_consent_required | canonical | derived from seller marital status/regime or onboarding spouse consent flag | seller_individual_capacity_pack, seller_spouse_consent_pack |
| seller_spouse_email | seller_spouse_email | canonical | seller onboarding spouseEmail | seller_spouse_consent_pack |
| seller_spouse_full_name | seller_spouse_full_name | canonical | seller onboarding spouseName | seller_spouse_consent_pack |
| seller_spouse_id_number | seller_spouse_id_number | canonical | seller onboarding spouseIdNumber | seller_spouse_consent_pack |
| seller_trust_registration_number | seller_trust_registration_number | canonical | seller onboarding trust registration number | seller_trust_authority_pack |
| seller_trustee_names | seller_trustee_names | canonical | seller onboarding trusteeNames | seller_trust_authority_pack |
| signed_date | signed_date | canonical | document_packet_signers.signed_at | signature_pages |
| special_conditions | special_conditions | canonical | document.special conditions from context | special_conditions |
| suspensive_conditions | suspensive_conditions | canonical | transaction special condition notes | suspensive_conditions |
| transaction_reference | transaction_reference | canonical | transactions.id or external reference | cover_page |
| unit_number | property_unit_number | alias_or_noncanonical | seller onboarding unitNumber OR listing unit number | property_details |
| witness_signature | witness_signature | canonical | document_signing_fields | signature_pages |

### Merge-Field Minimisation

| Code | Fields | Recommendation |
| --- | --- | --- |
| ROUTE_FLAGS_SHOULD_NOT_RENDER_AS_FACTS | finance_type, buyer_spouse_consent_required, seller_spouse_consent_required | Use these to choose clauses/routes; avoid printing them as bare factual rows unless counsel wants them visible. |
| FREE_TEXT_BLOCKS_NEED_APPROVED_EMPTY_STATE | special_conditions, suspensive_conditions, annexures_list | Keep only genuinely deal-specific text as merge data; standard legal paragraphs should be fixed template wording. |

## Heading Issues

| Code | Section | Current | Recommended |
| --- | --- | --- | --- |
| CLIENT_FACING_PACKET_OR_PACK_HEADING | buyer_individual_capacity_pack | Buyer Individual Capacity Pack | Buyer Individual Capacity |
| CLIENT_FACING_PACKET_OR_PACK_HEADING | buyer_company_authority_pack | Buyer Company Authority Pack | Buyer Company Authority |
| CLIENT_FACING_PACKET_OR_PACK_HEADING | buyer_trust_authority_pack | Buyer Trust Authority Pack | Buyer Trust Authority |
| CLIENT_FACING_PACKET_OR_PACK_HEADING | buyer_spouse_consent_pack | Buyer Spouse Consent Pack | Buyer Spouse Consent |
| CLIENT_FACING_PACKET_OR_PACK_HEADING | seller_individual_capacity_pack | Seller Individual Capacity Pack | Seller Individual Capacity |
| CLIENT_FACING_PACKET_OR_PACK_HEADING | seller_company_authority_pack | Seller Company Authority Pack | Seller Company Authority |
| CLIENT_FACING_PACKET_OR_PACK_HEADING | seller_trust_authority_pack | Seller Trust Authority Pack | Seller Trust Authority |
| CLIENT_FACING_PACKET_OR_PACK_HEADING | seller_spouse_consent_pack | Seller Spouse Consent Pack | Seller Spouse Consent |
| CLIENT_FACING_PACKET_OR_PACK_HEADING | property_full_title_pack | Full Title Property Pack | Full Title Property |
| CLIENT_FACING_PACKET_OR_PACK_HEADING | property_sectional_title_pack | Sectional Title Property Pack | Sectional Title Property |
| CLIENT_FACING_PACKET_OR_PACK_HEADING | bond_finance_pack | Bond Finance Pack | Bond Finance |
| CLIENT_FACING_PACKET_OR_PACK_HEADING | cash_sale_pack | Cash Sale Payment Pack | Cash Sale Payment |
| CLIENT_FACING_PACKET_OR_PACK_HEADING | cash_contribution_pack | Combination Finance Cash Contribution Pack | Combination Finance Cash Contribution |

## Blank / Irrelevant Render Risks

| Code | Section | Severity | Detail |
| --- | --- | --- | --- |
| UNCONDITIONED_FIELD_BLOCK | cover_page | watch | Unconditioned labelled fields should hide missing optional rows or block when legally required. |
| UNCONDITIONED_FIELD_BLOCK | buyer_details | watch | Unconditioned labelled fields should hide missing optional rows or block when legally required. |
| UNCONDITIONED_FIELD_BLOCK | seller_details | watch | Unconditioned labelled fields should hide missing optional rows or block when legally required. |
| UNCONDITIONED_FIELD_BLOCK | purchase_terms | watch | Unconditioned labelled fields should hide missing optional rows or block when legally required. |
| UNCONDITIONED_FIELD_BLOCK | parties | watch | Unconditioned labelled fields should hide missing optional rows or block when legally required. |
| PLACEHOLDER_ONLY_LINE | seller_individual_capacity_pack | warning | Placeholder-only lines can become blank legal whitespace when optional values are missing. |
| UNCONDITIONED_FIELD_BLOCK | property_details | watch | Unconditioned labelled fields should hide missing optional rows or block when legally required. |
| UNCONDITIONED_FIELD_BLOCK | commission_terms | watch | Unconditioned labelled fields should hide missing optional rows or block when legally required. |
| UNCONDITIONED_FIELD_BLOCK | purchase_price | watch | Unconditioned labelled fields should hide missing optional rows or block when legally required. |
| PLACEHOLDER_ONLY_LINE | suspensive_conditions | warning | Placeholder-only lines can become blank legal whitespace when optional values are missing. |
| OPTIONAL_SECTION_CAN_RENDER_EMPTY | special_conditions | warning | Optional OTP section has placeholders and needs a hide-or-approved-empty-state rule. |
| PLACEHOLDER_ONLY_LINE | special_conditions | warning | Placeholder-only lines can become blank legal whitespace when optional values are missing. |
| UNCONDITIONED_FIELD_BLOCK | signature_pages | watch | Unconditioned labelled fields should hide missing optional rows or block when legally required. |

## Recommended Next Actions

| Phase | Priority | Action |
| --- | --- | --- |
| 4 | P0 | Carry the signed mandatory disclosure form into the OTP as an annexure/status reference without making blank merge fields visible. |
| 2 | P0 | Normalise OTP merge fields and remove clause text from data fields before vNext wording is drafted. |
| 4 | P1 | Rename technical OTP headings while preserving internal section keys and routing rules. |
| 5 | P1 | Add hide-empty-row/section rendering rules and approved empty-state wording for optional OTP sections. |
| 4 | P1 | Add a controlled occupation clause with occupation date, occupational rent and risk/benefit treatment where applicable. |
| 4 | P1 | Decide whether fixtures/fittings and defect disclosure are standard text, annexure-driven, or special-condition driven. |
| 4 | P1 | Add controlled wording for compliance certificates, rates/levies, transfer costs and risk allocation. |

