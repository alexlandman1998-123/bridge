# OTP Template vNext Phase 16 Signer Session QA

Generated: 2026-08-05T10:19:34.447Z
Version: otp_signer_session_qa_phase16_v1
Contract: otp-vnext-signer-session-qa-phase16-v1
Status: OTP_SIGNER_SESSION_QA_READY_FOR_FINAL_COMPLETION_DRY_RUN
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| Proved session routes | 2 |
| Signer sessions | 6 |
| Other-signer fields visible | 0 |
| Completed fields | 0 |
| Invalid sessions | 0 |
| Missing audit events | 0 |
| Blockers | 0 |
| Warnings | 0 |
| Proceed to final completion dry-run | yes |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE16_DISPATCH_DRY_RUN_READY | yes | Phase 15 signing dispatch dry-run is ready before signer-session QA. |
| PHASE16_BOTH_ROUTE_SIGNER_SESSIONS_PROVED | yes | Signer sessions open and scope correctly for both resale and new-development routes. |
| PHASE16_EXACT_DISPATCH_BOUND | yes | Each signer session is bound to the exact dispatch dry-run envelope. |
| PHASE16_ALL_SIGNER_SESSIONS_OPEN | yes | Every dry-run recipient has one matching signer session. |
| PHASE16_EXACT_PDF_AND_FIELD_SCOPE_VALID | yes | Every signer sees the exact generated PDF and only their own fields. |
| PHASE16_NO_CROSS_SIGNER_FIELD_VISIBILITY | yes | Signer sessions expose no other signer fields. |
| PHASE16_COMPLETION_SUPPRESSED | yes | Signer-session QA cannot complete or mutate fields. |
| PHASE16_CROSS_SIGNER_MUTATION_BLOCKED | yes | Attempts to affect another signer are blocked. |
| PHASE16_SESSION_AUDIT_EVENTS_PLANNED | yes | Signer-session open, scope and completion-suppression audit events are planned. |

## Route Signer Sessions

| Route | Sessions | Roles | Exact Dispatch | Other Fields Visible | Completed Fields | Pass |
| --- | --- | --- | --- | --- | --- | --- |
| Existing / resale property OTP | 2 | purchaser_1, seller | yes | 0 | 0 | yes |
| New development OTP | 4 | purchaser_1, developer_authorised_signatory, contractor_authorised_signatory, agent | yes | 0 | 0 | yes |

## Boundary

Phase 16 verifies signer-session QA only. It does not complete fields, submit signatures, call provider callbacks, or finalise signed OTP artifacts.
