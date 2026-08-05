# OTP Template vNext Phase 12 Staging Activation

Generated: 2026-08-05T10:07:02.655Z
Version: otp_staging_activation_phase12_v1
Contract: otp-vnext-staging-activation-phase12-v1
Status: OTP_STAGING_ACTIVATION_READY_FOR_GUARDED_ENABLEMENT
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| Activated routes | 2 |
| Runtime-ready routes | 2 |
| Canary organisations | 1 |
| DOCX flag | false |
| Fallback flag | false |
| Blockers | 0 |
| Warnings | 0 |
| Can activate staging | yes |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE12_RUNTIME_INTEGRATION_READY | yes | Phase 11 runtime integration is ready before staging activation. |
| PHASE12_ACTIVATION_CONTRACT_CURRENT | yes | Staging activation uses the current Phase 12 contract. |
| PHASE12_STAGING_TARGET_LOCKED | yes | Activation target is explicitly staging with a project reference. |
| PHASE12_GUARDED_CANARY_MODE | yes | Activation is limited to guarded staging canary mode. |
| PHASE12_TEST_SUITE_READ_ONLY | yes | Phase 12 verification remains read-only and does not mutate staging. |
| PHASE12_CANARY_ORGANISATION_SCOPED | yes | Staging activation is scoped to at least one canary organisation. |
| PHASE12_BOTH_ROUTES_ACTIVATED | yes | Resale and new-development routes are included and runtime-ready. |
| PHASE12_NATIVE_PDF_FLAGS_ENABLED | yes | Staging flags enable OTP vNext and native PDF rendering. |
| PHASE12_DOCX_FLAG_DISABLED | yes | Staging keeps OTP DOCX generation disabled. |
| PHASE12_GENERIC_FALLBACK_FLAG_DISABLED | yes | Staging keeps generic OTP fallback disabled. |
| PHASE12_APPROVAL_REFERENCES_PRESENT | yes | Settings admin and counsel approval references are present. |
| PHASE12_ROLLBACK_REFERENCE_PRESENT | yes | Rollback/disable reference is present before activation. |
| PHASE12_REQUIRED_EVIDENCE_BOUND | yes | Activation plan carries Phase 10, Phase 11, Phase 9, counsel and rollback evidence markers. |

## Activation Plan

| Field | Value |
| --- | --- |
| Environment | staging |
| Project ref | staging-project-ref |
| Mode | guarded_staging_canary |
| Reference | OTP-VNEXT-STAGING-PHASE12 |
| Approved by | settings_admin |
| Counsel approval | otp-vnext-counsel-review |
| Rollback | otp-vnext-disable-runtime-flag |
| Dry run only | true |
| Canaries | staging-otp-sandbox-agency |

## Route Activation

| Route | Enabled | Template Key | Runtime | Renderer | Artifact | Fallback Free |
| --- | --- | --- | --- | --- | --- | --- |
| Existing / resale property OTP | yes | otp_resale_existing_property_native_pdf_v1 | ready | native_structured | pdf | yes |
| New development OTP | yes | otp_new_development_native_pdf_v1 | ready | native_structured | pdf | yes |

## Runtime Flags

| Flag | Value |
| --- | --- |
| otp_vnext_enabled | true |
| otp_vnext_native_pdf_enabled | true |
| otp_vnext_docx_generation_enabled | false |
| otp_vnext_generic_fallback_enabled | false |

## Boundary

Phase 12 certifies the guarded staging activation plan and remains read-only in tests. It does not write staging flags, publish templates, or replace post-activation smoke testing.
