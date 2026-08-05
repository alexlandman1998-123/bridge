# OTP Template vNext Phase 13 Staging Smoke / Generated PDF Proof

Generated: 2026-08-05T10:09:43.688Z
Version: otp_staging_smoke_pdf_proof_phase13_v1
Contract: otp-vnext-staging-smoke-pdf-proof-phase13-v1
Status: OTP_STAGING_SMOKE_PDF_PROOF_READY_FOR_SIGNING_QA
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| Proved routes | 2 |
| PDF artifacts | 2 |
| Native PDFs verified | 2 |
| Persisted PDFs | 2 |
| Fallback used | 0 |
| DOCX artifacts | 0 |
| Blockers | 0 |
| Warnings | 0 |
| Proceed to signing QA | yes |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE13_STAGING_ACTIVATION_READY | yes | Phase 12 staging activation is ready before generated PDF proof. |
| PHASE13_BOTH_ROUTE_PDFS_PROVED | yes | Generated staging PDF proof exists for both resale and new-development routes. |
| PHASE13_ARTIFACTS_ARE_PDF | yes | Every staging smoke artifact is application/pdf. |
| PHASE13_NATIVE_RENDERER_VERIFIED | yes | Every staging smoke PDF is verified as native structured output. |
| PHASE13_TRANSACTION_PDFS_PERSISTED | yes | Generated PDFs are persisted as transaction PDF artifacts. |
| PHASE13_NO_FALLBACK_USED | yes | Generated staging PDFs did not use generic fallback routing. |
| PHASE13_NO_DOCX_ARTIFACTS | yes | Staging smoke proof contains no DOCX/Word generated artifact. |
| PHASE13_VISUAL_SHELL_AND_LAYOUT_PROVED | yes | Logo, company details, footer, page numbers, website, legal sections, terms, signatures, and layout smoke markers pass. |
| PHASE13_ROUTE_CONTENT_SEPARATION_PROVED | yes | Resale and new-development generated PDF proofs do not leak forbidden route markers. |

## Generated PDF Proofs

| Route | Packet | Version | File | Pages | Bytes | Renderer | Persisted | Fallback | DOCX | Pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Existing / resale property OTP | otp-smoke-resale-packet | otp-smoke-resale-version | OTP_Resale_Staging_Smoke.pdf | 18 | 182000 | native_structured | yes | no | no | yes |
| New development OTP | otp-smoke-development-packet | otp-smoke-development-version | OTP_New_Development_Staging_Smoke.pdf | 22 | 214000 | native_structured | yes | no | no | yes |

## Boundary

Phase 13 verifies generated staging PDF proof evidence for both OTP routes. It does not dispatch signing envelopes, collect signatures, or replace human legal/design review of the staged PDFs.
