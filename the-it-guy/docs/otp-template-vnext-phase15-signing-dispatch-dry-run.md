# OTP Template vNext Phase 15 Signing Dispatch Dry Run

Generated: 2026-08-05T10:15:28.503Z
Version: otp_signing_dispatch_dry_run_phase15_v1
Contract: otp-vnext-signing-dispatch-dry-run-phase15-v1
Status: OTP_SIGNING_DISPATCH_DRY_RUN_READY_FOR_SIGNER_SESSION_QA
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| Proved dry-runs | 2 |
| Recipients | 6 |
| Insecure links | 0 |
| Route leaks | 0 |
| Unsuppressed deliveries | 0 |
| Missing audit events | 0 |
| Missing stop conditions | 0 |
| Blockers | 0 |
| Warnings | 0 |
| Proceed to signer-session QA | yes |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE15_SIGNING_ENVELOPE_QA_READY | yes | Phase 14 signing envelope QA is ready before dispatch dry-run. |
| PHASE15_BOTH_ROUTE_DISPATCH_DRY_RUNS_PROVED | yes | Dispatch dry-run is prepared and valid for both resale and new-development routes. |
| PHASE15_EXACT_ENVELOPE_BOUND | yes | Each dry-run is bound to the exact prepared signing envelope. |
| PHASE15_RECIPIENT_MAPPING_COMPLETE | yes | Every signer has one valid route-scoped recipient mapping. |
| PHASE15_SECURE_LINKS_READY | yes | Every recipient has secure-link readiness evidence without persisting live signer links. |
| PHASE15_EMAIL_AND_PROVIDER_SUPPRESSED | yes | Dry-run suppresses email delivery and provider envelope creation. |
| PHASE15_ROUTE_RECIPIENTS_SEPARATE | yes | Resale and new-development recipient mappings remain route-separated. |
| PHASE15_AUDIT_EVENTS_PLANNED | yes | Dry-run plans dispatch, secure-link and suppressed-delivery audit events. |
| PHASE15_STOP_CONDITIONS_BOUND | yes | Dry-run binds stop conditions for recipient, link, provider, email, route-leak and rollback failures. |
| PHASE15_ROLLBACK_REFERENCE_BOUND | yes | Dry-run carries a rollback/disable reference for staging signing dispatch. |

## Route Dispatch Dry Runs

| Route | Envelope | Recipients | Roles | Delivery Suppressed | Rollback | Pass |
| --- | --- | --- | --- | --- | --- | --- |
| Existing / resale property OTP | otp-smoke-resale-packet-envelope | 2 | purchaser_1, seller | yes | otp-vnext-disable-staging-signing-dispatch | yes |
| New development OTP | otp-smoke-development-packet-envelope | 4 | purchaser_1, developer_authorised_signatory, contractor_authorised_signatory, agent | yes | otp-vnext-disable-staging-signing-dispatch | yes |

## Boundary

Phase 15 verifies signing dispatch dry-run readiness only. It does not create provider envelopes, persist signer links, email signers, or collect signatures.
