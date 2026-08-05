# OTP Generator Phase 49 Version Renewal Activation Receipt

Generated: 2026-08-05T16:03:29.620Z
Version: otp_version_renewal_activation_receipt_phase49_v1
Contract: otp-vnext-version-renewal-activation-receipt-phase49-v1
Status: OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_READY_FOR_LIVE_WRITE_GUARD
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Ready receipts | 1 |
| Blocked receipts | 9 |
| Routes | 2 |
| Write terms | 6 |
| Stop conditions | 9 |
| Blockers | 0 |
| Proceed to live write guard | yes |
| Next phase | Phase 50: Version Renewal Live Write Guard |

## Receipt

| Field | Value |
| --- | --- |
| Receipt id | otp-vnext-version-renewal-activation-receipt-2026-08-05 |
| Receipt status | authority_format_recorded |
| Issued at | 2026-08-05T16:03:29.620Z |
| Expires at | 2026-08-06T23:59:59.000Z |
| Issued by role | system_release_manager |
| Authorised by role | accountable_template_release_owner |
| Approval reference | phase47-release-operator-activation-guard |
| Source simulation id | otp-vnext-phase48-controlled-version-renewal-activation-dry-run |
| Source simulation fingerprint | otp-phase48-source:8e86f29c:2055 |
| Version key | otp-template-vnext-2026-08-renewal |
| Previous version key | otp-template-vnext-phase39 |
| Rollback plan reference | phase45-template-renewal-rollback-plan |
| Receipt fingerprint | otp-phase49-receipt:94f5503a:3349 |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE49_PHASE48_CONTROLLED_DRY_RUN_READY | yes | Phase 48 controlled version renewal activation dry-run is ready before an activation receipt can be issued. |
| PHASE49_GOOD_ACTIVATION_RECEIPT_READY | yes | A clean Phase 48 dry-run can issue a receipt for the next live write guard without mutating production. |
| PHASE49_RECEIPT_AUTHORITY_PRESENT | yes | Receipt includes id, authority status, issuing role, authorising role, authority scope, and approval reference. |
| PHASE49_RECEIPT_TIME_WINDOW_VALID | yes | Receipt issue and expiry window is valid. |
| PHASE49_BOTH_ROUTE_RECEIPTS_BOUND | yes | Receipt records exact resale and new-development route rows. |
| PHASE49_VERSION_POINTER_RECEIPT_BOUND | yes | Receipt binds the target version pointer to the Phase 48 simulation. |
| PHASE49_WRITE_TERMS_REQUIRE_SEPARATE_LIVE_WRITE_GUARD | yes | Write terms require the receipt, a separate live write guard, operator confirmation, rollback, and matching fingerprint. |
| PHASE49_RECEIPT_FINGERPRINT_MATCHES | yes | Receipt fingerprint matches authority, source dry-run, routes, version pointer, rollback, and write terms. |
| PHASE49_BLOCKED_PHASE48_DRY_RUN_REJECTED | yes | A blocked Phase 48 dry-run cannot issue a usable receipt. |
| PHASE49_MISSING_AUTHORITY_BLOCKED | yes | Missing authority or approval reference blocks the receipt. |
| PHASE49_EXPIRED_RECEIPT_BLOCKED | yes | Expired receipts cannot proceed to live write guard. |
| PHASE49_ROUTE_RECEIPT_MISMATCH_BLOCKED | yes | Route receipt template and output fingerprint mismatches are blocked. |
| PHASE49_VERSION_POINTER_MISMATCH_BLOCKED | yes | Version pointer receipt mismatches are blocked. |
| PHASE49_UNSAFE_WRITE_TERMS_BLOCKED | yes | Receipt terms cannot permit production write by themselves. |
| PHASE49_OPERATOR_MISMATCH_BLOCKED | yes | Operator mismatches are blocked. |
| PHASE49_ROLLBACK_PLAN_BLOCKED | yes | Missing rollback plan reference blocks the receipt. |
| PHASE49_RECEIPT_FINGERPRINT_MISMATCH_BLOCKED | yes | Receipt fingerprint mismatches are blocked. |
| PHASE49_PACKAGE_SCRIPTS_WIRED | yes | Package scripts expose the Phase 49 test, report, and vNext verification chain entry. |

## Write Terms

| Term | Required |
| --- | --- |
| receipt_required_before_version_renewal_write | yes |
| separate_apply_command_required | yes |
| matching_receipt_fingerprint_required | yes |
| operator_confirmation_required | yes |
| rollback_plan_required | yes |
| no_uncontrolled_write_allowed | yes |

## Route Receipts

| Route | Route Key | Target Template | Target Envelope | Fingerprint | Operations | Receipt Required |
| --- | --- | --- | --- | --- | --- | --- |
| Existing / resale property OTP | resale_existing_property | otp-resale-template-vnext-phase45 | otp-resale-envelope-vnext-phase45 | aaaae46aaeaaaeaeaaaaaaaaaaaaeaaa00000000000000000000000000000000 | switch_route_default, switch_signing_envelope, validate_generated_otp | yes |
| New development OTP | new_development | otp-new-development-template-vnext-phase45 | otp-new-development-envelope-vnext-phase45 | aaaae46aaeaadeaeaaaaeaa00000000000000000000000000000000000000000 | switch_route_default, switch_signing_envelope, validate_generated_otp | yes |

## Blocked Receipt Proofs

| Status | Allowed | Blockers |
| --- | --- | --- |
| OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_READY_FOR_LIVE_WRITE_GUARD | yes | none |
| OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_BLOCKED | no | phase48_activation_dry_run_not_ready, phase48_activation_receipt_not_allowed, phase48_activation_dry_run_has_blockers, source_dry_run_status_mismatch |
| OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_BLOCKED | no | receipt_authorising_role_missing, receipt_approval_reference_missing, operator_confirmation_approval_reference_mismatch |
| OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_BLOCKED | no | receipt_expired_or_not_yet_valid |
| OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_BLOCKED | no | route_receipt_target_template_mismatch:resale_existing_property, route_receipt_output_fingerprint_mismatch:resale_existing_property |
| OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_BLOCKED | no | version_pointer_target_version_mismatch |
| OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_BLOCKED | no | write_terms_allow_production_write, write_terms_separate_apply_not_required |
| OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_BLOCKED | no | operator_confirmation_operator_mismatch, operator_confirmation_confirmed_by_mismatch |
| OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_BLOCKED | no | rollback_plan_reference_mismatch |
| OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_BLOCKED | no | receipt_fingerprint_mismatch |

## Boundary

Phase 49 records the exact authority and activation receipt format required before any version renewal live write guard may proceed. It binds the Phase 48 dry-run, resale and new-development route receipts, version pointer, operator authority, rollback reference, stop conditions, and write terms. It remains receipt-only: it does not execute production writes, mutate live defaults, change version pointers, dispatch signing, or publish templates.
