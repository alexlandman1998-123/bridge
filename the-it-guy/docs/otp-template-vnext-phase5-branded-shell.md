# OTP Template vNext Phase 5 Branded Shell

Generated: 2026-08-02T00:00:00.000Z
Version: otp_template_vnext_phase5_branded_shell_v1
Status: OTP_BRANDED_SHELL_READY_FOR_CONTENT_RULES
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Variants | 2 |
| Shell slots | 8 |
| Canonical placeholders | 21 |
| Top-left logo | yes |
| Top-right details | yes |
| Blockers | 0 |
| Warnings | 0 |

## Shell Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE5_TOP_LEFT_LOGO_SLOT_PRESENT | yes | OTP shell has a top-left organisation logo slot with text fallback. |
| PHASE5_TOP_RIGHT_DETAILS_SLOT_PRESENT | yes | OTP shell has top-right route, reference and template details. |
| PHASE5_RESALE_AND_DEVELOPMENT_SHELLS_PRESENT | yes | OTP shell resolves both resale and new development manifests. |
| PHASE5_SHELL_TOKENS_CANONICAL | yes | Every shell placeholder is registered as an OTP merge field. |
| PHASE5_SHELL_SOURCE_OWNERS_KNOWN | yes | Every shell slot has known Phase 2 source ownership. |
| PHASE5_LAYOUT_CONTRACT_ON_EVERY_SLOT | yes | Every shell slot carries the Phase 5 layout contract. |
| PHASE5_BLANK_RENDER_RISK_CONTROLLED | yes | Required slots have fallbacks and optional slots are blank-safe. |
| PHASE5_BUYER_ONBOARDING_NOT_DUMPING_GROUND | yes | Buyer onboarding does not own branding, transfer, developer, agent FFC or trust-account shell data. |
| PHASE5_RESALE_EXISTING_PROPERTY_SINGLE_SIGNATURE_ZONE | yes | Existing / resale property OTP has exactly one signature zone. |
| PHASE5_RESALE_EXISTING_PROPERTY_SIGNATURE_ZONE_LAST | yes | Existing / resale property OTP keeps the signature zone last. |
| PHASE5_RESALE_EXISTING_PROPERTY_SIGNATURE_LAYOUT_BOUND | yes | Existing / resale property OTP signature zone is bound to the OTP route-aware signature layout contract. |
| PHASE5_NEW_DEVELOPMENT_SINGLE_SIGNATURE_ZONE | yes | New development OTP has exactly one signature zone. |
| PHASE5_NEW_DEVELOPMENT_SIGNATURE_ZONE_LAST | yes | New development OTP keeps the signature zone last. |
| PHASE5_NEW_DEVELOPMENT_SIGNATURE_LAYOUT_BOUND | yes | New development OTP signature zone is bound to the OTP route-aware signature layout contract. |
| PHASE5_RESALE_SUMMARY_USES_SELLER | yes | Resale shell summary uses seller and existing-property details. |
| PHASE5_DEVELOPMENT_SUMMARY_USES_DEVELOPER | yes | New development shell summary uses developer, development and unit details. |
| PHASE5_DEVELOPMENT_SIGNATURE_NOT_RESALE_SIGNATURE | yes | New development shell uses developer signature instead of resale seller signature. |
| PHASE5_FIRST_PAGE_HAS_CLAUSE_SPACE | yes | Reserved shell chrome leaves space for legal clauses on the first page. |

## Route Manifests

| Variant | Slots | Placeholders | Source Owners |
| --- | --- | --- | --- |
| Existing / resale property OTP | brand_header, document_header_details, otp_title_band, resale_transaction_summary, agency_footer, resale_signature_zone | organisation_logo_url, organisation_trading_name, otp_document_variant, transaction_reference, document_reference, template_version, buyer_full_name, seller_full_name, property_address, purchase_price, agent_full_name, agent_email, agent_phone, agent_ffc_number, buyer_signature, seller_signature | organisation_agent_settings, transaction_offer_terms, legal_template_registry, buyer_onboarding, seller_onboarding, listing_property_record, signing_runtime |
| New development OTP | brand_header, document_header_details, otp_title_band, development_transaction_summary, agency_footer, development_signature_zone | organisation_logo_url, organisation_trading_name, otp_document_variant, transaction_reference, document_reference, template_version, buyer_full_name, developer_name, development_name, property_unit_number, purchase_price, vat_inclusive_purchase_price, agent_full_name, agent_email, agent_phone, agent_ffc_number, buyer_signature, developer_signature | organisation_agent_settings, transaction_offer_terms, legal_template_registry, buyer_onboarding, development_setup, development_unit_setup, signing_runtime |

## Layout Estimates

| Variant | Reserved Height | Available Height | Signature Height | Clause Space |
| --- | --- | --- | --- | --- |
| resale_existing_property | 452 | 745.89 | 232 | yes |
| new_development | 466 | 745.89 | 232 | yes |

## Boundary

Phase 5 defines the branded OTP shell and deterministic shell audit. It does not publish a live template, draft counsel wording, or replace visual inspection of the rendered PDF/DOCX artifact.
