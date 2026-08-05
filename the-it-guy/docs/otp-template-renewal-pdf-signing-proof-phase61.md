# OTP Generator Phase 61 Generated PDF And Signing Envelope Proof

Generated: 2026-08-05T17:26:44.922Z
Version: otp_template_renewal_generated_pdf_signing_envelope_proof_phase61_v1
Contract: otp-vnext-template-renewal-generated-pdf-signing-envelope-proof-phase61-v1
Status: OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_READY_FOR_ATTORNEY_RECHECK
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Ready proofs | 1 |
| Blocked proofs | 10 |
| Routes | 2 |
| PDF proofs | 2 |
| Signing envelope proofs | 2 |
| Blockers | 0 |
| Next phase | Phase 62: Attorney Recheck Decision |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE61_PHASE60_TEMPLATE_UPDATE_DRAFT_READY | yes | Generated PDF and signing envelope proof starts only after Phase 60 template update draft readiness. |
| PHASE61_GOOD_PDF_SIGNING_PROOF_READY | yes | A clean template update draft can produce generated PDF and signing envelope proof without mutating production data. |
| PHASE61_PROOF_BOUND_TO_TEMPLATE_UPDATE_DRAFT | yes | Generated PDF and signing envelope proof is bound to the exact Phase 60 draft fingerprint. |
| PHASE61_BOTH_ROUTE_PDFS_GENERATED | yes | Resale and new-development generated PDF proofs are both present. |
| PHASE61_BOTH_ROUTE_ENVELOPES_MAPPED | yes | Resale and new-development signing envelope proofs are both mapped. |
| PHASE61_PDF_CONTENT_AND_LAYOUT_PROVED | yes | Generated PDF proof includes branding, legal wording, buyer cost obligations, witness/signature blocks, initials, and hides route/source debug fields. |
| PHASE61_SIGNING_FIELDS_ROLE_SCOPED | yes | Signing envelope proof maps buyer, seller/developer, witness, date, signature, and every-page initial fields by route. |
| PHASE61_PDF_ENVELOPE_ALIGNMENT_PROVED | yes | Signing envelope proof matches the generated PDFs with witnesses and every-page initials. |
| PHASE61_NO_PRODUCTION_WRITE_ALLOWED | yes | Phase 61 proves generated PDF and signing envelope alignment only and cannot approve, publish, mutate live envelopes, final PDFs, or dispatch signing. |
| PHASE61_DRAFT_FINGERPRINT_MISMATCH_BLOCKED | yes | Proof manifest must match the Phase 60 template update draft fingerprint. |
| PHASE61_MISSING_ROUTE_PDF_BLOCKED | yes | Missing resale or new-development generated PDF proof blocks attorney recheck. |
| PHASE61_INCOMPLETE_PDF_BLOCKED | yes | Generated PDFs missing legal wording, buyer cost obligations, required sections, branding, witnesses, or initials are blocked. |
| PHASE61_INCOMPLETE_SIGNING_ENVELOPE_BLOCKED | yes | Signing envelopes missing roles, witnesses, dates, signatures, role scoping, or every-page initials are blocked. |
| PHASE61_CONTENT_SCAN_BLOCKED | yes | Failed content scan, visible debug fields, missing wording, or DOC/DOCX references block the proof. |
| PHASE61_ALIGNMENT_BLOCKED | yes | PDF/signing envelope mismatch, missing witnesses, or missing every-page initials blocks attorney recheck. |
| PHASE61_DOCX_PROOF_BLOCKED | yes | DOC/DOCX generated proof artifacts remain blocked. |
| PHASE61_DISPATCH_BLOCKED | yes | Generated PDF and signing envelope proof cannot email, dispatch signing, or request production writes. |
| PHASE61_EVIDENCE_BLOCKED | yes | Missing or invalid generated PDF/signing proof evidence blocks attorney recheck. |
| PHASE61_PRODUCTION_WRITE_BLOCKED | yes | Production writes or live signing/final PDF mutations block generated PDF and signing proof. |
| PHASE61_PACKAGE_SCRIPTS_WIRED | yes | Package scripts expose the Phase 61 test, report, and vNext verification chain entry. |

## Proof Manifest

| Field | Value |
| --- | --- |
| Proof ID | otp-vnext-phase61-generated-pdf-signing-envelope-proof |
| Template update draft fingerprint | b0620a5900000000000000000000000000000000000000000000000000000000 |
| Attorney response fingerprint | 299cf89300000000000000000000000000000000000000000000000000000000 |
| Proof mode | generated_pdf_and_signing_envelope_proof_only |
| Attorney recheck required | yes |

## Generated PDF Proofs

| Route | Status | Pages | PDF | Legal | Buyer Costs | Witnesses | Initials |
| --- | --- | --- | --- | --- | --- | --- | --- |
| resale_existing_property | generated | 12 | output/pdf/OTP_Phase61_resale_existing_property.pdf | yes | yes | yes | yes |
| new_development | generated | 18 | output/pdf/OTP_Phase61_new_development.pdf | yes | yes | yes | yes |

## Signing Envelope Proofs

| Route | Status | Roles | Signatures | Dates | Witnesses | Initial Scope |
| --- | --- | --- | --- | --- | --- | --- |
| resale_existing_property | mapped | buyer, seller_or_developer, buyer_witness, seller_witness | 4 | 4 | 2 | every_page |
| new_development | mapped | buyer, seller_or_developer, buyer_witness, seller_witness | 4 | 4 | 2 | every_page |

## Alignment Matrix

| Field | Value |
| --- | --- |
| matrix_id | phase61-pdf-signing-envelope-alignment-matrix |
| status | aligned |
| pdf_proofs | 2 |
| signing_envelopes | 2 |
| envelopes_match_pdf | yes |
| every_page_initialled | yes |
| witnesses_mapped | yes |

## PDF Signing Proof Receipts

| Status | Ready | PDFs | Envelopes | Evidence | Blockers |
| --- | --- | --- | --- | --- | --- |
| OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_READY_FOR_ATTORNEY_RECHECK | yes | 2 | 2 | 6 | none |
| OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_BLOCKED | no | 2 | 2 | 6 | pdf_signing_proof_template_update_draft_fingerprint_mismatch |
| OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_BLOCKED | no | 1 | 2 | 6 | pdf_proof_route_missing:new_development, pdf_signing_alignment_pdf_count_mismatch |
| OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_BLOCKED | no | 2 | 2 | 6 | pdf_proof_legal_wording_missing:resale_existing_property, pdf_proof_buyer_cost_obligations_missing:resale_existing_property, pdf_proof_section_missing:resale_existing_property:commercial_terms, pdf_proof_section_missing:resale_existing_property:legal_wording, pdf_proof_section_missing:resale_existing_property:buyer_cost_obligations, pdf_proof_section_missing:resale_existing_property:signatures_and_initials |
| OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_BLOCKED | no | 2 | 2 | 6 | signing_proof_role_missing:new_development:seller_or_developer, signing_proof_role_missing:new_development:buyer_witness, signing_proof_role_missing:new_development:seller_witness, signing_proof_witness_fields_missing:new_development, signing_proof_initial_scope_invalid:new_development, signing_proof_role_scope_missing:new_development |
| OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_BLOCKED | no | 2 | 2 | 6 | pdf_content_scan_not_passed, pdf_content_scan_legal_wording_missing, pdf_content_scan_route_marker_visible, pdf_content_scan_docx_reference_observed |
| OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_BLOCKED | no | 2 | 2 | 6 | pdf_signing_alignment_matrix_not_aligned, pdf_signing_alignment_pdf_envelope_mismatch, pdf_signing_alignment_initials_missing, pdf_signing_alignment_witnesses_missing |
| OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_BLOCKED | no | 2 | 2 | 6 | pdf_proof_docx_source_observed:resale_existing_property |
| OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_BLOCKED | no | 2 | 2 | 6 | pdf_signing_proof_email_dispatch_requested, pdf_signing_proof_signing_dispatch_requested, pdf_signing_proof_production_write_requested |
| OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_BLOCKED | no | 2 | 2 | 1 | pdf_signing_proof_evidence_missing:generated_pdf_proof_bundle, pdf_signing_proof_evidence_missing:pdf_content_scan, pdf_signing_proof_evidence_missing:signing_envelope_field_map, pdf_signing_proof_evidence_missing:route_alignment_matrix, pdf_signing_proof_evidence_missing:no_write_attestation, pdf_signing_proof_evidence_invalid:template_update_draft_trace |
| OTP_TEMPLATE_RENEWAL_GENERATED_PDF_SIGNING_ENVELOPE_PROOF_BLOCKED | no | 2 | 2 | 6 | pdf_signing_proof_production_write_attempted, pdf_signing_proof_signing_envelope_mutation_observed, pdf_signing_proof_final_pdf_mutation_observed |

## Boundary

Phase 61 proves route-separated generated PDFs and signing envelope maps from the Phase 60 template update draft. It does not record attorney approval, publish templates, mutate live legal wording, change route defaults, alter live signing envelopes, create final signed PDFs, email reviewers, or dispatch signing links.
