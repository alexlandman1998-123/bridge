# OTP Template vNext Phase 14 Signing Envelope QA

Generated: 2026-08-05T10:12:49.866Z
Version: otp_signing_envelope_qa_phase14_v1
Contract: otp-vnext-signing-envelope-qa-phase14-v1
Status: OTP_SIGNING_ENVELOPE_QA_READY_FOR_SIGNING_DISPATCH_DRY_RUN
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| Proved envelopes | 2 |
| Signers | 6 |
| Signing fields | 136 |
| Initials gaps | 0 |
| Route leaks | 0 |
| Dispatched envelopes | 0 |
| Blockers | 0 |
| Warnings | 0 |
| Proceed to dispatch dry-run | yes |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE14_PDF_PROOF_READY | yes | Phase 13 generated PDF proof is ready before signing envelope QA. |
| PHASE14_BOTH_ROUTE_ENVELOPES_PROVED | yes | Signing envelopes are prepared and valid for both resale and new-development routes. |
| PHASE14_EXACT_GENERATED_VERSION_BOUND | yes | Each envelope is bound to the exact generated PDF packet version and SHA. |
| PHASE14_REQUIRED_SIGNERS_PRESENT | yes | Every route has all required signer roles. |
| PHASE14_SIGNATURE_FIELDS_PRESENT | yes | Every signer has a required signature field. |
| PHASE14_DATE_FIELDS_PRESENT | yes | Every signer has a required signing date field. |
| PHASE14_INITIALS_ON_EVERY_PAGE | yes | Every signer has initials on every generated PDF page. |
| PHASE14_FIELD_GEOMETRY_VALID | yes | Every signing field has valid page and coordinate geometry. |
| PHASE14_ROUTE_SIGNING_ROLES_SEPARATE | yes | Resale and new-development signing roles remain route-separated. |
| PHASE14_ENVELOPES_NOT_DISPATCHED | yes | QA verifies prepared envelopes without sending signer links or provider envelopes. |

## Route Envelopes

| Route | Envelope | Packet | Version | Pages | Signers | Fields | Roles | Pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Existing / resale property OTP | otp-smoke-resale-packet-envelope | otp-smoke-resale-packet | otp-smoke-resale-version | 18 | 2 | 40 | purchaser_1, seller | yes |
| New development OTP | otp-smoke-development-packet-envelope | otp-smoke-development-packet | otp-smoke-development-version | 22 | 4 | 96 | purchaser_1, developer_authorised_signatory, contractor_authorised_signatory, agent | yes |

## Boundary

Phase 14 verifies prepared signing envelopes against generated staging PDFs. It does not dispatch signing links, create provider envelopes, collect signatures, or certify final signed document completion.
