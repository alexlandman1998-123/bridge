# Mandate Template vNext Phase 4 Wording

Generated: 2026-07-28T12:00:00.000Z
Version: mandate_template_vnext_phase4_wording_v1
Status: WORDING_VNEXT_READY_FOR_COUNSEL_REVIEW
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Sections | 16 |
| Signature sections | 1 |
| Wording gaps | 0 |
| Client-facing heading issues | 0 |
| Blank render risks | 0 |
| Alias/non-canonical fields | 0 |
| Unknown fields | 0 |
| Content gate blockers | 0 |

## Section Plan

| Order | Key | Client Heading | Type | Required | Conditional | Fields |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | introduction_purpose | Introduction and Purpose | legal_text | yes | no | organisation_trading_name, agent_full_name |
| 5 | parties | Parties | dynamic_fields | yes | no | seller_full_name, seller_id_number, seller_email, seller_phone, seller_entity_type, seller_domicilium_address, organisation_trading_name, organisation_legal_name, organisation_registration_number, organisation_registered_address, organisation_ffc_number, organisation_fsp_number, agent_full_name, agent_email, agent_phone, agent_ffc_number |
| 20 | seller_individual_capacity_pack | Seller Capacity | legal_text | no | yes | seller_entity_type, seller_marital_status |
| 21 | seller_company_authority_pack | Company Seller Authority | legal_text | no | yes | seller_entity_type, seller_company_registration_number, seller_representative_name, seller_representative_capacity, seller_resolution_date, seller_authority_basis |
| 22 | seller_trust_authority_pack | Trust Seller Authority | legal_text | no | yes | seller_entity_type, seller_trust_registration_number, seller_trustee_names, seller_representative_name, seller_representative_capacity, seller_authority_basis |
| 23 | seller_spouse_consent_pack | Spouse Consent | legal_text | no | yes | seller_spouse_consent_required, seller_spouse_full_name, seller_spouse_id_number, seller_spouse_email |
| 35 | property_details | Property Details | dynamic_fields | yes | no | property_address, property_display_address, property_suburb, property_city, property_type, property_title_type |
| 40 | property_full_title_pack | Full Title Property Details | legal_text | no | yes | property_title_type, erf_number, erf_size, floor_size, property_estate_name |
| 41 | property_sectional_title_pack | Sectional Title Property Details | legal_text | no | yes | property_title_type, property_unit_number, property_section_number, sectional_title_number, property_complex_name, property_estate_name |
| 60 | mandate_terms | Mandate Terms | legal_text | yes | no | mandate_type, mandate_start_date, mandate_end_date |
| 61 | commission_terms | Commission Terms | dynamic_fields | yes | no | asking_price, commission_structure, mandate_commission_percent, mandate_commission_amount, vat_handling |
| 62 | marketing_listing_terms | Marketing and Listing Terms | legal_text | yes | no |  |
| 80 | special_conditions | Special Conditions | legal_text | no | yes | special_conditions, annexures_list |
| 81 | general_terms | General Legal Terms | legal_text | yes | no | document_reference |
| 82 | popia_fica | POPIA and FICA | legal_text | yes | no | seller_full_name |
| 100 | signature_pages | Signature Pages | signature_zone | yes | no | seller_full_name, seller_signature, seller_initials, signed_date, witness_signature, organisation_trading_name, organisation_legal_name, agent_full_name, agent_ffc_number |

## Wording Notes

- The appointment wording is now the opening paragraph and uses canonical organisation fields.
- Mandatory disclosure status and annexure wording are included in the introduction.
- FFC wording is included in the appointment clause and agent/firm FFC fields are preserved.
- Commission wording now covers effective cause, transfer/payment timing, protection period and VAT treatment.
- Internal section keys ending in `_pack` are preserved for routing, but client-facing labels and rendered headings do not use Pack or Packet language.
- Optional sections use visibility conditions plus blank-safe metadata so empty rows/sections can be hidden without disturbing the PDF layout.

## Counsel Review Boundary

This Phase 4 artifact is wording-ready for counsel review. It is not a legal approval record and does not mutate the live template.
