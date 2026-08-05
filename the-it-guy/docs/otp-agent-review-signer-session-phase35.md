# OTP Generator Phase 35 Agent Review Signer Session Runtime Alignment

Generated: 2026-08-05T13:53:27.676Z
Version: otp_agent_review_signer_session_phase35_v1
Contract: otp-vnext-agent-review-signer-session-phase35-v1
Status: OTP_AGENT_REVIEW_SIGNER_SESSION_READY_FOR_COMPLETION_GUARD_EXTENSION
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Aligned signer-session routes | 2 |
| Unsafe signer sessions blocked | 3 |
| Other signer fields visible in allowed sessions | 0 |
| Blockers | 0 |
| Next phase | Phase 36: OTP Agent Review Completion Guard Runtime Alignment |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE35_PHASE34_DISPATCH_GUARD_READY | yes | Signer-session alignment starts only after the Phase 34 dispatch guard is ready. |
| PHASE35_BOTH_ROUTES_OPEN_ROLE_SCOPED_SESSIONS | yes | Resale and new-development guarded OTP dispatches open signer sessions scoped to their target signer role. |
| PHASE35_EXACT_REVIEWED_VERSION_BOUND | yes | Each signer session is bound to the exact generated OTP packet version from the guarded dispatch. |
| PHASE35_ONLY_OWN_FIELDS_VISIBLE | yes | Signer sessions expose only the active signer role fields. |
| PHASE35_ROUTE_ROLE_LEAK_SESSION_BLOCKED | yes | A resale guarded dispatch cannot open as a new-development signer role. |
| PHASE35_VERSION_MISMATCH_BLOCKED | yes | A signer session pointing at a different OTP version is blocked. |
| PHASE35_CROSS_SIGNER_FIELD_VISIBILITY_BLOCKED | yes | A signer session carrying another signer role field is blocked. |
| PHASE35_SIGNER_PORTAL_CONTRACT_WIRED | yes | SignerPortal consumes canonical signer sessions, scoped fields and field-scope denial handling. |
| PHASE35_PACKAGE_SCRIPTS_WIRED | yes | Package scripts expose the Phase 35 test and report. |

## Session Decisions

| Route | Target Role | Session Role | Version | Fields | Other Fields | Allowed | Blockers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Existing / resale property OTP | seller | seller | otp-phase35-resale_existing_property-version | 5 | 0 | yes | none |
| New development OTP | developer_authorised_signatory | developer_authorised_signatory | otp-phase35-new_development-version | 6 | 0 | yes | none |
| Existing / resale property OTP | seller | developer_authorised_signatory | otp-phase35-resale_existing_property-version | 5 | 5 | no | session_signer_role_mismatch:developer_authorised_signatory:seller, session_role_not_allowed_for_route:developer_authorised_signatory, other_signer_fields_visible:purchaser_1,purchaser_1,purchaser_1,purchaser_1,purchaser_1 |
| Existing / resale property OTP | seller | seller | wrong-version | 5 | 0 | no | session_version_binding_mismatch |
| Existing / resale property OTP | seller | seller | otp-phase35-resale_existing_property-version | 6 | 1 | no | other_signer_fields_visible:purchaser_1 |

## Boundary

Phase 35 proves signer-session alignment for guarded OTP dispatches. It does not apply signatures, complete fields, submit signer sessions, create final signed artifacts, email signers, or mutate production templates.
