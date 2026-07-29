# Mandate Template vNext Phase 5 PDF Layout

Generated: 2026-07-28T12:00:00.000Z
Version: mandate_template_vnext_phase5_pdf_layout_v1
Status: PDF_LAYOUT_PRESERVED_AND_REFINED
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Sections | 16 |
| Signature sections | 1 |
| Suppressed body sections | 1 |
| Blank-safe optional sections | 7 |
| Max estimated pages | 5 |
| Blockers | 0 |
| Warnings | 0 |

## Layout Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE5_SECTION_SEQUENCE_PRESERVED | yes | vNext keeps the mandate section sequence and conditional-pack banding stable. |
| PHASE5_SINGLE_SIGNATURE_ZONE | yes | Exactly one signature section remains in the template manifest. |
| PHASE5_SIGNATURE_ZONE_LAST | yes | Signature section remains the final section. |
| PHASE5_SIGNATURE_BODY_SUPPRESSED | yes | Native PDF signature body is suppressed so only authoritative signature panels render. |
| PHASE5_SIGNATURE_LAYOUT_CONTRACT_BOUND | yes | vNext signature section is bound to the existing authoritative native PDF signature layout contract. |
| PHASE5_CLIENT_HEADINGS_CLEAN | yes | Client-facing labels and rendered headings avoid Pack/Packet wording. |
| PHASE5_OPTIONAL_SECTIONS_BLANK_SAFE | yes | Every optional vNext section has a visibility condition or hide-when-empty metadata. |
| PHASE5_LAYOUT_CONTRACT_ON_EVERY_SECTION | yes | Every vNext section carries the Phase 5 native PDF layout contract. |
| PHASE5_ESTIMATED_PAGE_BUDGET | yes | Estimated rich mandate scenarios remain within a six-page native PDF budget before annexures. |
| PHASE5_RENDERER_METADATA_GUARD_PRESENT | yes | Renderer honors explicit metadata for signature-zone body suppression. |

## Scenario Estimates

| Scenario | Pages | Signature Height | Remaining Height | Included Sections |
| --- | --- | --- | --- | --- |
| Default mandate, no optional data | 4 | 220 | 234 | introduction_purpose, parties, property_details, mandate_terms, commission_terms, marketing_listing_terms, general_terms, popia_fica |
| Company sectional title with optional terms | 5 | 220 | 75 | introduction_purpose, parties, seller_company_authority_pack, property_details, property_sectional_title_pack, mandate_terms, commission_terms, marketing_listing_terms, special_conditions, general_terms, popia_fica |
| Individual spouse consent full title | 5 | 360 | 94 | introduction_purpose, parties, seller_individual_capacity_pack, seller_spouse_consent_pack, property_details, property_full_title_pack, mandate_terms, commission_terms, marketing_listing_terms, general_terms, popia_fica |

## Section Layout

| Order | Section | Type | Required | Conditional | Body Suppressed | Estimated Height | Wrapped Lines |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | introduction_purpose | legal_text | yes | no | no | 197 | 10 |
| 5 | parties | dynamic_fields | yes | no | no | 315 | 18 |
| 20 | seller_individual_capacity_pack | legal_text | no | yes | no | 112 | 4 |
| 21 | seller_company_authority_pack | legal_text | no | yes | no | 183 | 9 |
| 22 | seller_trust_authority_pack | legal_text | no | yes | no | 183 | 9 |
| 23 | seller_spouse_consent_pack | legal_text | no | yes | no | 154 | 7 |
| 35 | property_details | dynamic_fields | yes | no | no | 135 | 6 |
| 40 | property_full_title_pack | legal_text | no | yes | no | 154 | 7 |
| 41 | property_sectional_title_pack | legal_text | no | yes | no | 168 | 8 |
| 60 | mandate_terms | legal_text | yes | no | no | 154 | 7 |
| 61 | commission_terms | dynamic_fields | yes | no | no | 259 | 14 |
| 62 | marketing_listing_terms | legal_text | yes | no | no | 168 | 8 |
| 80 | special_conditions | legal_text | no | yes | no | 92 | 3 |
| 81 | general_terms | legal_text | yes | no | no | 159 | 7 |
| 82 | popia_fica | legal_text | yes | no | no | 154 | 7 |
| 100 | signature_pages | signature_zone | yes | no | yes | 0 | 0 |

## Visual Verification Boundary

This Phase 5 report is a deterministic pre-render layout gate. A rendered PDF must still be visually inspected before live rollout, using the native PDF artifact generated from the approved vNext template.
