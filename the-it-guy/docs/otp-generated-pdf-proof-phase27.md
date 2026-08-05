# OTP Generator Phase 27 Generated PDF Proof

Generated: 2026-08-05T12:50:28.238Z
Version: otp_generated_pdf_proof_phase27_v1
Contract: otp-vnext-generated-pdf-proof-phase27-v1
Status: OTP_GENERATED_PDF_PROOF_READY_FOR_PHASE28_MATTER_ATTORNEY_QUOTE_PORTAL_FLOW
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| PDFs | 2 |
| Rendered PNG proofs | 10 |
| Blockers | 0 |
| Next phase | Phase 28: Matter Attorney Quote Portal Flow |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE27_PHASE26_RUNTIME_READY | yes | Generated PDF proof starts only after Phase 26 runtime data wiring is verified. |
| PHASE27_BOTH_ROUTE_PDFS_GENERATED | yes | Both resale and new-development PDFs are generated as native PDF files with no DOCX artifact path. |
| PHASE27_BRANDED_SHELL_VISUALLY_PROVED | yes | Rendered PDF evidence includes logo top left, company details top right, footer placement, page numbers and nonblank rendered PNGs. |
| PHASE27_ROUTE_COMMERCIAL_TERMS_AND_LEGAL_MARKERS_PROVED | yes | PDF text proves route-specific commercial terms, legal section range and no resale/new-development leakage. |
| PHASE27_SIGNATURES_AND_INITIALS_RENDERED | yes | Generated PDFs render route-specific signature/date blocks and initials on every page. |

## Generated PDFs

| Route | PDF | Pages | Bytes | PNG Proof | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| resale_existing_property | /Users/alexanderlandman/the-it-guy/the-it-guy/output/pdf/OTP_Phase27_Resale_Proof.pdf | 5 | 17556 | /Users/alexanderlandman/the-it-guy/the-it-guy/output/pdf/phase27-rendered-pages/otp-phase27-resale_existing_property-1.png | sha256:49e51ea89852c2c5b268499a0426bd95b146859092b28fe72376dc5373ab589e |
| new_development | /Users/alexanderlandman/the-it-guy/the-it-guy/output/pdf/OTP_Phase27_New_Development_Proof.pdf | 5 | 18035 | /Users/alexanderlandman/the-it-guy/the-it-guy/output/pdf/phase27-rendered-pages/otp-phase27-new_development-1.png | sha256:81c28abbab73e618ffc3ff1c9490950f6d282f08d678f25462d0475cf8f0754b |

## Runtime Boundary

Phase 27 generates local PDF proof artifacts and rendered PNG evidence only. It does not publish templates, mutate transaction commission, dispatch signing envelopes, publish attorney quote documents, or activate production defaults. Phase 28 is the matter attorney quote portal flow.
