# OTP Template vNext Phase 21 Production Activation Receipt

Generated: 2026-08-05T10:43:00.152Z
Version: otp_production_activation_receipt_phase21_v1
Contract: otp-vnext-production-activation-receipt-phase21-v1
Status: OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_FOR_LIVE_WRITE_GUARD
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| Valid route receipts | 2 |
| Authority present | yes |
| Time window valid | yes |
| Activation fingerprint matches | yes |
| Preflight fingerprint matches | yes |
| Lock fingerprint matches | yes |
| Target bound | yes |
| Rollback bound | yes |
| Write terms safe | yes |
| Missing stop conditions | 0 |
| Blockers | 0 |
| Warnings | 0 |
| Proceed to live write guard | yes |

## Receipt

| Field | Value |
| --- | --- |
| Receipt id | otp-vnext-production-activation-receipt-2026-08-05 |
| Receipt status | authority_format_recorded |
| Issued at | 2026-08-05T10:40:00.000Z |
| Expires at | 2026-08-06T10:40:00.000Z |
| Issued by role | system_release_manager |
| Authorised by role | accountable_production_release_owner |
| Approval reference | otp-vnext-phase18-release-candidate-lock |
| Activation fingerprint | otp-prod-activation:52a368aa:2520 |
| Preflight fingerprint | otp-prod-preflight:fb13c43b:1254 |
| Lock fingerprint | otp-rc-lock:8eaf7ce6:825 |
| Rollback plan id | otp-vnext-production-promotion-rollback-2026-08-05 |
| Target environment | production |
| Target project ref | production-project-ref |
| Receipt fingerprint | otp-prod-receipt:404a93c8:2002 |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE21_CONTROLLED_ACTIVATION_DRY_RUN_READY | yes | Phase 20 controlled production activation dry-run is ready before receipt authority is recorded. |
| PHASE21_RECEIPT_AUTHORITY_PRESENT | yes | Receipt includes id, status, issuing role, authorising role, authority scope and approval reference. |
| PHASE21_RECEIPT_TIME_WINDOW_VALID | yes | Receipt issue and expiry window is valid for this check. |
| PHASE21_ACTIVATION_AUTHORITY_CHAIN_BOUND | yes | Receipt is bound to the exact activation dry-run, preflight, release lock and approval reference. |
| PHASE21_PRODUCTION_TARGET_BOUND | yes | Receipt target is production and matches the activation dry-run project and route set. |
| PHASE21_ROLLBACK_PLAN_BOUND | yes | Receipt carries the rollback plan required by controlled activation. |
| PHASE21_WRITE_TERMS_REQUIRE_RECEIPT_AND_SEPARATE_APPLY | yes | Receipt terms require the receipt before production write and still require a separate apply command and operator confirmation. |
| PHASE21_BOTH_ROUTE_RECEIPTS_RECORDED | yes | Receipt records exact resale and new-development route authority rows. |
| PHASE21_ROUTE_RECEIPT_FINGERPRINTS_BOUND | yes | Each route receipt is bound to the activation route and QA fingerprints. |
| PHASE21_RECEIPT_FINGERPRINT_MATCHES | yes | Receipt fingerprint matches authority, target, write terms, rollback and route receipt payload. |
| PHASE21_RECEIPT_STOP_CONDITIONS_BOUND | yes | Stop conditions cover activation readiness, fingerprint mismatch, expiry, authority, routes and unsafe write terms. |

## Write Terms

| Term | Required |
| --- | --- |
| receipt_required_before_production_write | yes |
| separate_apply_command_required | yes |
| matching_receipt_fingerprint_required | yes |
| operator_confirmation_required | yes |
| rollback_plan_required | yes |
| no_uncontrolled_write_allowed | yes |

## Route Receipts

| Route | Source Packet | Version | Target Template | Operations | Receipt Required | Fingerprints | Pass |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Existing / resale property OTP | otp-smoke-resale-packet | otp-smoke-resale-version | otp_resale_existing_property_native_pdf_v1 | 3/3 | yes | yes | yes |
| New development OTP | otp-smoke-development-packet | otp-smoke-development-version | otp_new_development_native_pdf_v1 | 3/3 | yes | yes | yes |

## Boundary

Phase 21 records the activation authority/receipt format required before any real production write is allowed. It does not grant uncontrolled write authority, execute production writes, mutate live templates, change route defaults, dispatch signing, or activate production traffic.
