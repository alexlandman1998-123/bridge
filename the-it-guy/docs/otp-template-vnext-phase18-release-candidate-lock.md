# OTP Template vNext Phase 18 Release Candidate Lock

Generated: 2026-08-05T10:30:06.296Z
Version: otp_release_candidate_lock_phase18_v1
Contract: otp-vnext-release-candidate-lock-phase18-v1
Status: OTP_RELEASE_CANDIDATE_LOCK_READY_FOR_PRODUCTION_PROMOTION_PREFLIGHT
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| Frozen routes | 2 |
| Route output drift | 0 |
| QA evidence drift | 0 |
| Route fingerprint mismatches | 0 |
| Route leaks | 0 |
| Mutation blocked | yes |
| Missing stop conditions | 0 |
| Blockers | 0 |
| Warnings | 0 |
| Proceed to production promotion preflight | yes |

## Release Lock

| Field | Value |
| --- | --- |
| Lock id | otp-vnext-release-candidate-lock-2026-08-05 |
| Locked at | 2026-08-05T10:30:00.000Z |
| Locked by role | system_qa_release_guard |
| Approval reference | otp-vnext-phase18-release-candidate-lock |
| Environment | staging |
| Project ref | staging-project-ref |
| Promotion target | production_promotion_preflight |
| Fingerprint | otp-rc-lock:8eaf7ce6:825 |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE18_FINAL_COMPLETION_DRY_RUN_READY | yes | Phase 17 final completion dry-run is ready before release-candidate lock. |
| PHASE18_RELEASE_LOCK_PRESENT | yes | Release-candidate lock has a lock id, accountable role, staging environment and approval reference. |
| PHASE18_BOTH_ROUTE_OUTPUTS_FROZEN | yes | Approved resale and new-development generated outputs are frozen. |
| PHASE18_ROUTE_OUTPUT_FINGERPRINTS_MATCH | yes | Current route outputs still match their release-candidate fingerprints. |
| PHASE18_QA_EVIDENCE_CHAIN_FROZEN | yes | QA evidence from generated PDF proof through final completion dry-run is frozen. |
| PHASE18_RELEASE_CANDIDATE_FINGERPRINT_MATCHES | yes | The overall release-candidate fingerprint matches the locked route and QA evidence payload. |
| PHASE18_PRODUCTION_PROMOTION_MUTATION_BLOCKED | yes | Production promotion remains blocked until this exact lock is used by the next preflight. |
| PHASE18_RESALE_AND_NEW_DEVELOPMENT_LOCKED_SEPARATELY | yes | Resale and new-development release-candidate route locks remain separate. |
| PHASE18_APPROVAL_REFERENCE_BOUND | yes | Release-candidate lock carries an approval/change reference. |
| PHASE18_DRIFT_STOP_CONDITIONS_BOUND | yes | Stop conditions cover output drift, QA drift, fingerprint mismatch, promotion bypass, route leakage and missing approval reference. |

## Route Locks

| Route | Packet | Version | Template | PDF SHA | Envelope | Roles | Route Fingerprint | QA Fingerprint | Pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Existing / resale property OTP | otp-smoke-resale-packet | otp-smoke-resale-version | otp_resale_existing_property_native_pdf_v1 | sha256:phase13-resale-pdf-proof | otp-smoke-resale-packet-envelope | purchaser_1, seller | otp-rc-route-resale_existing_property:0f431dd6:541 | otp-rc-qa-resale_existing_property:72a10543:1081 | yes |
| New development OTP | otp-smoke-development-packet | otp-smoke-development-version | otp_new_development_native_pdf_v1 | sha256:phase13-development-pdf-proof | otp-smoke-development-packet-envelope | purchaser_1, developer_authorised_signatory, contractor_authorised_signatory, agent | otp-rc-route-new_development:10188de6:605 | otp-rc-qa-new_development:72a10543:1081 | yes |

## Boundary

Phase 18 freezes the approved staging route outputs and QA evidence chain only. It does not promote to production, mutate live templates, dispatch signers, create final signed artifacts, or replace the production promotion preflight.
