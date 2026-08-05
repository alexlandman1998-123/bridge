# OTP Template vNext Phase 11 Runtime Integration

Generated: 2026-08-05T10:04:57.097Z
Version: otp_runtime_integration_phase11_v1
Renderer contract: otp_native_structured_pdf_runtime_phase11_v1
Status: OTP_RUNTIME_INTEGRATION_READY_FOR_PDF_PROOF
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| Ready runtime routes | 2 |
| Distinct route templates | 2 |
| Fallback blocked | yes |
| DOCX generation enabled | false |
| Blockers | 0 |
| Warnings | 0 |
| Proceed to PDF proof | yes |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE11_SETTINGS_ADMIN_READY | yes | Runtime integration consumes the Phase 10 settings/admin readiness contract. |
| PHASE11_RUNTIME_ROUTES_READY | yes | Runtime launch readiness is ready for both resale and new-development routes. |
| PHASE11_GENERATES_WITHOUT_FALLBACK | yes | Generation uses first-class route templates and does not need fallback. |
| PHASE11_ROUTE_TEMPLATE_KEYS_DISTINCT | yes | Resale and new-development runtime routes resolve distinct template keys. |
| PHASE11_NATIVE_PDF_RUNTIME_BOUND | yes | Runtime templates use native_structured render mode and produce PDF artifacts. |
| PHASE11_DOCX_RUNTIME_PATH_DISABLED | yes | Runtime integration has no OTP DOCX generation path enabled. |
| PHASE11_BRANDED_SHELL_BOUND | yes | Runtime integration carries branded shell slots and placeholders for every route. |
| PHASE11_STRUCTURED_TERMS_BOUND | yes | Runtime integration carries structured commercial term manifests for every route. |
| PHASE11_SIGNING_PLAN_BOUND | yes | Runtime integration carries signing roles, signatures, initials and date fields for every route. |
| PHASE11_FALLBACK_GENERATION_BLOCKED | yes | Runtime generation blocks unapproved generic OTP fallback. |

## Runtime Routes

| Route | Template Key | Launch Status | Renderer | Artifact | Fallback Free | Signing Fields |
| --- | --- | --- | --- | --- | --- | --- |
| Existing / resale property OTP | otp_resale_existing_property_native_pdf_v1 | ready | native_structured | pdf | yes | 6 |
| New development OTP | otp_new_development_native_pdf_v1 | ready | native_structured | pdf | yes | 12 |

## Fallback Probe

| Route | Status | Blocks Generation | Blocker Codes |
| --- | --- | --- | --- |
| New development OTP | blocked | yes | OTP_RUNTIME_UNAPPROVED_FALLBACK |

## Boundary

Phase 11 proves runtime integration against deterministic OTP vNext contracts. It does not render or visually inspect the final PDF; that belongs to the next PDF proof phase.
