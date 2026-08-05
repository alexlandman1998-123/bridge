# OTP Template vNext Phase 10 Settings And Admin Readiness

Generated: 2026-08-05T10:02:28.392Z
Version: otp_settings_admin_readiness_phase10_v1
Status: OTP_SETTINGS_ADMIN_READY_FOR_RENDERER_PROOF
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| Required settings | 12 |
| Upstream audits | 5 |
| Blockers | 0 |
| Warnings | 0 |
| Proceed to renderer proof | yes |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE10_UPSTREAM_AUDITS_READY | yes | Phase 6 shell, Phase 6 legal content, Phase 7 structured terms, Phase 8 signatures and Phase 9 scanner are ready. |
| PHASE10_REQUIRED_ADMIN_SETTINGS_LOCKED | yes | All required OTP admin settings are explicitly locked to the native PDF path. |
| PHASE10_DOCX_GENERATION_DISABLED | yes | DOCX/Word generation is disabled for OTP vNext settings. |
| PHASE10_NATIVE_PDF_RENDERING_SELECTED | yes | OTP generation uses the native structured PDF renderer and PDF artifact. |
| PHASE10_GENERIC_FALLBACK_DISABLED | yes | Generic OTP fallback templates are disabled for route-specific generation. |
| PHASE10_RESALE_AND_DEVELOPMENT_ROUTES_SEPARATE | yes | Resale and new-development routes have distinct admin template keys. |
| PHASE10_BRANDING_REQUIRED | yes | Logo, company details, agency footer, page number and website shell are mandatory. |
| PHASE10_APPROVAL_AND_SCANNER_REQUIRED | yes | Counsel review, admin approval and Phase 9 scanner are mandatory before publish. |

## Admin Settings

| Setting | Owner | Required | Actual | Pass |
| --- | --- | --- | --- | --- |
| otp_enabled | settings_admin | true | true | yes |
| document_renderer | document_runtime | native_structured_pdf | native_structured_pdf | yes |
| otp_generation_artifact | document_runtime | pdf | pdf | yes |
| docx_generation_enabled | document_runtime | false | false | yes |
| template_fallback_enabled | legal_template_registry | false | false | yes |
| branded_pdf_shell_enabled | organisation_agent_settings | true | true | yes |
| structured_terms_enabled | transaction_offer_terms | true | true | yes |
| signature_initials_enabled | signing_runtime | true | true | yes |
| phase9_content_scanner_required | legal_template_registry | true | true | yes |
| counsel_review_required | legal_template_registry | true | true | yes |
| admin_publish_approval_required | settings_admin | true | true | yes |
| organisation_branding_required | organisation_agent_settings | true | true | yes |

## Route Template Keys

| Route | Template Key | Pass |
| --- | --- | --- |
| Existing / resale property OTP | otp_resale_existing_property_native_pdf_v1 | yes |
| New development OTP | otp_new_development_native_pdf_v1 | yes |

## Upstream Audits

| Audit | Version | Status | Required Status | Pass |
| --- | --- | --- | --- | --- |
| brandedShell | otp_template_vnext_phase6_branded_pdf_shell_v1 | OTP_BRANDED_SHELL_READY_FOR_CONTENT_RULES | OTP_BRANDED_SHELL_READY_FOR_CONTENT_RULES | yes |
| legalContent | otp_legal_content_templates_phase6_v1 | OTP_LEGAL_CONTENT_READY_FOR_COUNSEL_REVIEW | OTP_LEGAL_CONTENT_READY_FOR_COUNSEL_REVIEW | yes |
| structuredTerms | otp_structured_terms_phase7_v1 | OTP_STRUCTURED_TERMS_READY_FOR_RENDERER_WIRING | OTP_STRUCTURED_TERMS_READY_FOR_RENDERER_WIRING | yes |
| signatures | otp_signature_initials_phase8_v1 | OTP_SIGNATURE_INITIALS_READY_FOR_RENDERER_WIRING | OTP_SIGNATURE_INITIALS_READY_FOR_RENDERER_WIRING | yes |
| contentScanner | otp_content_scanner_phase9_v1 | OTP_CONTENT_SCANNER_PHASE9_READY_FOR_RENDERER_WIRING | OTP_CONTENT_SCANNER_PHASE9_READY_FOR_RENDERER_WIRING | yes |

## Boundary

Phase 10 locks the settings/admin contract for OTP vNext. It does not publish live templates, mutate organisation settings, replace legal counsel sign-off, or replace the next rendered PDF proof pass.
