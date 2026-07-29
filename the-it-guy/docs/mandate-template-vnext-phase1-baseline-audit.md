# Mandate Template vNext Phase 1 Baseline Audit

Generated: 2026-07-28T18:19:15.754Z
Status: V_NEXT_REMEDIATION_REQUIRED
Mutated data: false

## Template

| Field | Value |
| --- | --- |
| Template ID | a52e6404-d597-413b-a5d3-ddbd8129461b |
| Template key | mandate_default_v1 |
| Label | Seller Mandate · Arch9 Starter |
| Status | published |
| Active/default | yes / yes |
| Version tag | content-gate-v5 |

## Visual Baseline

| Metric | Value |
| --- | --- |
| Sections | 16 |
| Required sections | 8 |
| Conditional sections | 6 |
| Signature sections | 1 |
| Total wording word count | 480 |

Section sequence:

1. introduction_purpose
2. parties
3. seller_individual_capacity_pack
4. seller_company_authority_pack
5. seller_trust_authority_pack
6. seller_spouse_consent_pack
7. property_details
8. property_full_title_pack
9. property_sectional_title_pack
10. mandate_terms
11. commission_terms
12. marketing_listing_terms
13. special_conditions
14. general_terms
15. popia_fica
16. signature_pages

## Section Inventory

| Order | Key | Label | Rendered heading | Type | Required | Conditional | Fields | Words |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | introduction_purpose | Introduction and Purpose | MANDATE AGREEMENT | legal_text | yes | no | 3 | 46 |
| 5 | parties | Parties | SELLER | dynamic_fields | yes | no | 10 | 31 |
| 20 | seller_individual_capacity_pack | Seller Individual Capacity Pack | SELLER INDIVIDUAL CAPACITY | legal_text | no | yes | 2 | 25 |
| 21 | seller_company_authority_pack | Seller Company Authority Pack | SELLER COMPANY AUTHORITY | legal_text | no | yes | 6 | 37 |
| 22 | seller_trust_authority_pack | Seller Trust Authority Pack | SELLER TRUST AUTHORITY | legal_text | no | yes | 6 | 33 |
| 23 | seller_spouse_consent_pack | Seller Spouse Consent Pack | SELLER SPOUSE CONSENT | legal_text | no | yes | 4 | 24 |
| 35 | property_details | Property Details | PROPERTY | dynamic_fields | yes | no | 5 | 14 |
| 40 | property_full_title_pack | Full Title Property Pack | FULL TITLE PROPERTY DETAILS | legal_text | no | yes | 5 | 17 |
| 41 | property_sectional_title_pack | Sectional Title Property Pack | SECTIONAL TITLE PROPERTY DETAILS | legal_text | no | yes | 6 | 20 |
| 60 | mandate_terms | Mandate Terms | MANDATE TERMS | dynamic_fields | yes | no | 9 | 46 |
| 61 | commission_terms | Commission Terms | COMMISSION | dynamic_fields | yes | no | 5 | 46 |
| 62 | marketing_listing_terms | Marketing / Listing Terms | MARKETING AND LISTING | dynamic_fields | no | no | 3 | 39 |
| 80 | special_conditions | Special Conditions | SPECIAL CONDITIONS | dynamic_fields | no | no | 2 | 5 |
| 81 | general_terms | General Legal Terms | GENERAL TERMS | legal_text | yes | no | 1 | 51 |
| 82 | popia_fica | POPIA and FICA | POPIA AND FICA | legal_text | yes | no | 1 | 28 |
| 100 | signature_pages | Signature Pages | SIGNATURES | signature_zone | yes | no | 8 | 18 |

## Merge Fields

Total: 61; canonical: 59; alias/non-canonical: 2; unknown: 0

| Token | Canonical | Status | Source | Sections |
| --- | --- | --- | --- | --- |
| agency_legal_name | organisation_legal_name | alias_or_noncanonical | organisation legal name or agency legal profile | introduction_purpose |
| agent_email | agent_email | canonical | transactions.assigned_agent_email OR profile mapping | parties |
| agent_ffc_number | agent_ffc_number | canonical | agent profile mapping or lead assignment fields | signature_pages |
| agent_full_name | agent_full_name | canonical | transactions.assigned_agent OR lead assignment fields | introduction_purpose, parties, signature_pages |
| agent_phone | agent_phone | canonical | agent profile mapping or lead assignment fields | parties |
| annexures_list | annexures_list | canonical | mandate draft or onboarding annexuresList | special_conditions |
| asking_price | asking_price | canonical | mandate draft askingPrice | commission_terms, marketing_listing_terms |
| commission_structure | commission_structure | canonical | mandate draft commissionStructure | commission_terms |
| document_reference | document_reference | canonical | document_packets.id / template key | general_terms |
| erf_number | erf_number | canonical | unit metadata or onboarding data | property_full_title_pack |
| erf_size | erf_size | canonical | seller onboarding erfSize OR listing/property facts | property_full_title_pack |
| floor_size | floor_size | canonical | seller onboarding floorSize OR listing/property facts | property_full_title_pack |
| mandate_access_instructions | mandate_access_instructions | canonical | mandate draft or seller onboarding accessInstructions | mandate_terms, marketing_listing_terms |
| mandate_authority_granted | mandate_authority_granted | canonical | mandate draft authorityGranted with default legal wording fallback | mandate_terms |
| mandate_commission_amount | mandate_commission_amount | canonical | mandate draft commissionAmount | commission_terms |
| mandate_commission_percent | mandate_commission_percent | canonical | mandate draft commissionPercent | commission_terms |
| mandate_end_date | mandate_end_date | canonical | mandate draft mandateEndDate | mandate_terms |
| mandate_introduction_purpose | mandate_introduction_purpose | canonical | mandate draft introductionPurpose with default legal wording fallback | introduction_purpose |
| mandate_marketing_permissions | mandate_marketing_permissions | canonical | mandate draft or seller onboarding marketingPermissions | marketing_listing_terms |
| mandate_start_date | mandate_start_date | canonical | mandate draft mandateStartDate | mandate_terms |
| mandate_type | mandate_type | canonical | mandate draft mandateType | mandate_terms |
| organisation_name | organisation_trading_name | alias_or_noncanonical | organisations.display_name OR organisation trading-name settings | parties, signature_pages |
| property_address | property_address | canonical | transactions.property_address_line_1 OR onboarding property address | property_details |
| property_city | property_city | canonical | transactions.city OR onboarding city | property_details |
| property_complex_name | property_complex_name | canonical | seller onboarding schemeName OR estateComplexName | property_sectional_title_pack |
| property_display_address | property_display_address | canonical | seller onboarding property address plus sectional title / estate details | property_details |
| property_estate_name | property_estate_name | canonical | seller onboarding estateName OR estateComplexName | property_full_title_pack, property_sectional_title_pack |
| property_section_number | property_section_number | canonical | seller onboarding sectionNumber OR canonical property facts | property_sectional_title_pack |
| property_suburb | property_suburb | canonical | transactions.suburb OR development suburb | property_details |
| property_title_type | property_title_type | canonical | seller onboarding propertyStructureType OR normalized property facts | property_full_title_pack, property_sectional_title_pack |
| property_type | property_type | canonical | transactions.property_type OR listing/onboarding property type | property_details |
| property_unit_number | property_unit_number | canonical | seller onboarding unitNumber OR listing unit number | property_sectional_title_pack |
| sectional_title_number | sectional_title_number | canonical | unit metadata or seller onboarding scheme details | property_sectional_title_pack |
| seller_authority_basis | seller_authority_basis | canonical | seller onboarding authorityBasis | seller_company_authority_pack, seller_trust_authority_pack |
| seller_company_registration_number | seller_company_registration_number | canonical | seller onboarding companyRegistrationNumber OR seller registration number | seller_company_authority_pack |
| seller_domicilium_address | seller_domicilium_address | canonical | seller onboarding or transaction property address | parties |
| seller_email | seller_email | canonical | lead.sellerEmail OR mandate draft | parties |
| seller_entity_type | seller_entity_type | canonical | seller onboarding ownership type | parties, seller_individual_capacity_pack, seller_company_authority_pack, seller_trust_authority_pack |
| seller_full_name | seller_full_name | canonical | lead.sellerName/sellerSurname OR lead.name OR development owner | parties, popia_fica, signature_pages |
| seller_id_number | seller_id_number | canonical | seller onboarding form data or transaction fields | parties |
| seller_initials | seller_initials | canonical | document_signing_fields | signature_pages |
| seller_marital_status | seller_marital_status | canonical | seller onboarding maritalStatus | seller_individual_capacity_pack |
| seller_phone | seller_phone | canonical | lead.sellerPhone OR onboarding form | parties |
| seller_representative_capacity | seller_representative_capacity | canonical | seller onboarding authorized representative capacity | seller_company_authority_pack, seller_trust_authority_pack |
| seller_representative_name | seller_representative_name | canonical | seller onboarding authorized representative fields | seller_company_authority_pack, seller_trust_authority_pack |
| seller_resolution_date | seller_resolution_date | canonical | seller onboarding resolutionDate | seller_company_authority_pack |
| seller_signature | seller_signature | canonical | document_signing_fields | signature_pages |
| seller_spouse_consent_required | seller_spouse_consent_required | canonical | derived from seller marital status/regime or onboarding spouse consent flag | seller_spouse_consent_pack |
| seller_spouse_email | seller_spouse_email | canonical | seller onboarding spouseEmail | seller_spouse_consent_pack |
| seller_spouse_full_name | seller_spouse_full_name | canonical | seller onboarding spouseName | seller_spouse_consent_pack |
| seller_spouse_id_number | seller_spouse_id_number | canonical | seller onboarding spouseIdNumber | seller_spouse_consent_pack |
| seller_trust_registration_number | seller_trust_registration_number | canonical | seller onboarding trust registration number | seller_trust_authority_pack |
| seller_trustee_names | seller_trustee_names | canonical | seller onboarding trusteeNames | seller_trust_authority_pack |
| signed_date | signed_date | canonical | document_packet_signers.signed_at | signature_pages |
| special_conditions | special_conditions | canonical | document.special conditions from context | special_conditions |
| transfer_attorney_company_name | transfer_attorney_company_name | canonical | mandate draft transferAttorneyCompanyName | mandate_terms |
| transfer_attorney_contact_person | transfer_attorney_contact_person | canonical | mandate draft transferAttorneyContactPerson | mandate_terms |
| transfer_attorney_email | transfer_attorney_email | canonical | mandate draft transferAttorneyEmail | mandate_terms |
| transfer_attorney_phone | transfer_attorney_phone | canonical | mandate draft transferAttorneyPhone | mandate_terms |
| vat_handling | vat_handling | canonical | mandate draft vatHandling | commission_terms |
| witness_signature | witness_signature | canonical | document_signing_fields | signature_pages |

### Naming Decisions

| Code | Fields | Recommendation |
| --- | --- | --- |
| AGENCY_ORGANISATION_NAME_SPLIT | agency_legal_name, organisation_name | Decide whether legal documents consume registered legal name, trading/display name, or both. Phase 2 should make this explicit and avoid mixed usage in one appointment clause. |
| AGENCY_REGISTRATION_FIELD_ABSENT | agency_registration_number | Consider adding the agency/company registration number to the mandate data contract if counsel wants fuller party identification. |

## Wording Gaps

| Code | Severity | Recommendation |
| --- | --- | --- |
| MANDATORY_DISCLOSURE_CLAUSE_MISSING | blocking_for_vnext | Add a required mandate disclosure clause before the mandate can be accepted/sent. |
| FFC_VALIDITY_WORDING_MISSING | blocking_for_vnext | Opening appointment wording should state that the Agency and Agent hold valid FFCs where required by law. |
| COMMISSION_TRIGGER_AND_VAT_TOO_LIGHT | blocking_for_vnext | Tighten commission around effective cause/protection period, payment trigger, and VAT treatment. |
| POPIA_SHARING_RECIPIENTS_TOO_NARROW | warning | Expand POPIA/FICA wording to cover lawful sharing with conveyancers, bond originators, compliance providers and transaction service providers. |

## Heading Issues

| Code | Section | Current | Recommended |
| --- | --- | --- | --- |
| CLIENT_FACING_PACK_HEADING | seller_individual_capacity_pack | Seller Individual Capacity Pack | Seller Capacity |
| CLIENT_FACING_PACK_HEADING | seller_company_authority_pack | Seller Company Authority Pack | Company Seller Authority |
| CLIENT_FACING_PACK_HEADING | seller_trust_authority_pack | Seller Trust Authority Pack | Trust Seller Authority |
| CLIENT_FACING_PACK_HEADING | seller_spouse_consent_pack | Seller Spouse Consent Pack | Spouse Consent |
| CLIENT_FACING_PACK_HEADING | property_full_title_pack | Full Title Property Pack | Full Title Property Details |
| CLIENT_FACING_PACK_HEADING | property_sectional_title_pack | Sectional Title Property Pack | Sectional Title Property Details |

## Blank / Irrelevant Render Risks

| Code | Section | Severity | Detail |
| --- | --- | --- | --- |
| UNCONDITIONED_FIELD_BLOCK | parties | watch | Unconditioned labelled fields should hide missing optional rows or block when legally required. |
| OPTIONAL_SECTION_CAN_RENDER_EMPTY | seller_individual_capacity_pack | warning | Optional section has placeholders and needs a hide-or-approved-empty-state rule. |
| PLACEHOLDER_ONLY_LINE | seller_individual_capacity_pack | warning | Placeholder-only lines can become blank legal whitespace when optional values are missing. |
| OPTIONAL_SECTION_CAN_RENDER_EMPTY | seller_company_authority_pack | warning | Optional section has placeholders and needs a hide-or-approved-empty-state rule. |
| OPTIONAL_SECTION_CAN_RENDER_EMPTY | seller_trust_authority_pack | warning | Optional section has placeholders and needs a hide-or-approved-empty-state rule. |
| OPTIONAL_SECTION_CAN_RENDER_EMPTY | seller_spouse_consent_pack | warning | Optional section has placeholders and needs a hide-or-approved-empty-state rule. |
| UNCONDITIONED_FIELD_BLOCK | property_details | watch | Unconditioned labelled fields should hide missing optional rows or block when legally required. |
| OPTIONAL_SECTION_CAN_RENDER_EMPTY | property_full_title_pack | warning | Optional section has placeholders and needs a hide-or-approved-empty-state rule. |
| OPTIONAL_SECTION_CAN_RENDER_EMPTY | property_sectional_title_pack | warning | Optional section has placeholders and needs a hide-or-approved-empty-state rule. |
| UNCONDITIONED_FIELD_BLOCK | mandate_terms | watch | Unconditioned labelled fields should hide missing optional rows or block when legally required. |
| UNCONDITIONED_FIELD_BLOCK | commission_terms | watch | Unconditioned labelled fields should hide missing optional rows or block when legally required. |
| OPTIONAL_SECTION_CAN_RENDER_EMPTY | marketing_listing_terms | warning | Optional section has placeholders and needs a hide-or-approved-empty-state rule. |
| OPTIONAL_SECTION_CAN_RENDER_EMPTY | special_conditions | warning | Optional section has placeholders and needs a hide-or-approved-empty-state rule. |
| PLACEHOLDER_ONLY_LINE | special_conditions | warning | Placeholder-only lines can become blank legal whitespace when optional values are missing. |
| UNCONDITIONED_FIELD_BLOCK | signature_pages | watch | Unconditioned labelled fields should hide missing optional rows or block when legally required. |

## Recommended Next Actions

| Phase | Priority | Action |
| --- | --- | --- |
| 2 | P0 | Add required Mandatory Disclosure clause and acceptance gate. |
| 2 | P0 | Move the appointment wording into the introduction and include valid FFC wording. |
| 2 | P0 | Resolve merge-field naming decisions and alias/deprecated usage before editing template text. |
| 4 | P1 | Rename client-facing Pack headings while preserving internal section keys. |
| 5 | P1 | Add hide-empty-row/section rendering rules and approved empty-state wording. |
| 4 | P1 | Tighten commission trigger, payment timing, protection period and VAT wording. |

