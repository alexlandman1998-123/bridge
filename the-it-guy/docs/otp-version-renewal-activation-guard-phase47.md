# OTP Generator Phase 47 Version Renewal Activation Guard

Generated: 2026-08-05T15:49:58.614Z
Version: otp_version_renewal_activation_guard_phase47_v1
Contract: otp-vnext-version-renewal-activation-guard-phase47-v1
Status: OTP_VERSION_RENEWAL_ACTIVATION_GUARD_READY_FOR_CONTROLLED_ACTIVATION_DRY_RUN
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Passed guard receipts | 1 |
| Blocked guard receipts | 11 |
| Routes | 2 |
| Evidence items | 6 |
| Blockers | 0 |
| Next phase | Phase 48: Controlled Version Renewal Activation Dry Run |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE47_PHASE46_PUBLICATION_DRY_RUN_READY | yes | Activation guard starts only after Phase 46 publication dry-run is ready. |
| PHASE47_GOOD_ACTIVATION_GUARD_READY | yes | A clean Phase 46 dry-run can pass the activation guard without mutating production data. |
| PHASE47_RESALE_AND_NEW_DEVELOPMENT_GUARDED_SEPARATELY | yes | Resale and new-development activation targets must both be present and route-isolated. |
| PHASE47_NO_LIVE_WRITE_BEFORE_CONTROLLED_DRY_RUN | yes | The guard cannot perform live writes and must require a controlled activation dry-run first. |
| PHASE47_BLOCKED_PHASE46_RECEIPT_REJECTED | yes | A blocked Phase 46 publication receipt cannot pass the activation guard. |
| PHASE47_STALE_OPERATION_BLOCKED | yes | A stale dry-run id or version key blocks activation guard approval. |
| PHASE47_ROUTE_FINGERPRINT_MISMATCH_BLOCKED | yes | A route candidate fingerprint mismatch blocks activation guard approval. |
| PHASE47_MISSING_ROUTE_BLOCKED | yes | Missing resale or new-development activation target blocks the guard. |
| PHASE47_DOCX_REGRESSION_BLOCKED | yes | DOC/DOCX source references are blocked from activation guard approval. |
| PHASE47_OPERATOR_CONFIRMATION_MISMATCH_BLOCKED | yes | Operator identity, confirmation phrase, approval reference, and MFA must match. |
| PHASE47_LIVE_MUTATION_BLOCKED | yes | Production writes or live default mutation attempts are blocked by the activation guard. |
| PHASE47_ROLLBACK_CONTROL_BLOCKED | yes | Rollback restore, disable-candidate, dispatch stop, owner, and drill evidence are required. |
| PHASE47_MISSING_APPROVAL_BLOCKED | yes | All activation guard owner approvals are required. |
| PHASE47_FREEZE_WINDOW_BLOCKED | yes | A release freeze or incident freeze blocks activation guard approval. |
| PHASE47_MISSING_EVIDENCE_BLOCKED | yes | Missing route fingerprint manifest or other guard evidence blocks approval. |
| PHASE47_PACKAGE_SCRIPTS_WIRED | yes | Package scripts expose the Phase 47 test and report. |

## Guard Receipts

| Status | Allowed | Routes guarded | Evidence | Live default mutations | Blockers |
| --- | --- | --- | --- | --- | --- |
| OTP_VERSION_RENEWAL_ACTIVATION_GUARD_READY_FOR_CONTROLLED_ACTIVATION_DRY_RUN | yes | 2 | 6 | 0 | none |
| OTP_VERSION_RENEWAL_ACTIVATION_GUARD_BLOCKED | no | 2 | 6 | 0 | phase46_publication_not_ready, phase46_publication_dry_run_not_complete, phase46_publication_has_blockers |
| OTP_VERSION_RENEWAL_ACTIVATION_GUARD_BLOCKED | no | 2 | 6 | 0 | activation_source_dry_run_mismatch, activation_version_key_mismatch |
| OTP_VERSION_RENEWAL_ACTIVATION_GUARD_BLOCKED | no | 2 | 6 | 0 | observed_route_fingerprint_mismatch:new_development |
| OTP_VERSION_RENEWAL_ACTIVATION_GUARD_BLOCKED | no | 1 | 6 | 0 | route_activation_missing:resale_existing_property |
| OTP_VERSION_RENEWAL_ACTIVATION_GUARD_BLOCKED | no | 2 | 6 | 0 | route_activation_docx_source_observed:resale_existing_property |
| OTP_VERSION_RENEWAL_ACTIVATION_GUARD_BLOCKED | no | 2 | 6 | 0 | operator_requester_mismatch, operator_confirmation_phrase_mismatch, operator_mfa_not_verified |
| OTP_VERSION_RENEWAL_ACTIVATION_GUARD_BLOCKED | no | 2 | 6 | 1 | activation_production_write_requested, activation_live_default_mutation_requested, activation_signing_dispatch_requested, no_write_guard_not_audit_only, no_write_guard_mutated_data, no_write_guard_production_write_attempted, no_write_guard_live_default_mutation_observed, no_write_guard_production_artifact_mutation_observed, no_write_guard_signing_dispatch_mutation_observed |
| OTP_VERSION_RENEWAL_ACTIVATION_GUARD_BLOCKED | no | 2 | 6 | 0 | rollback_restore_previous_version_not_ready, rollback_drill_not_passed |
| OTP_VERSION_RENEWAL_ACTIVATION_GUARD_BLOCKED | no | 2 | 6 | 0 | missing_activation_approval:governance_owner |
| OTP_VERSION_RENEWAL_ACTIVATION_GUARD_BLOCKED | no | 2 | 6 | 0 | activation_window_not_approved, activation_window_freeze_active, activation_window_incident_freeze_active |
| OTP_VERSION_RENEWAL_ACTIVATION_GUARD_BLOCKED | no | 2 | 5 | 0 | missing_guard_evidence:route_candidate_fingerprint_manifest |

## Boundary

Phase 47 proves a staged Phase 46 template renewal can pass activation guard only when the exact dry-run receipt, version key, route candidate fingerprints, route isolation, operator confirmation, owner approvals, activation window, rollback controls, guard evidence, and no-write proof all match. It still does not activate live defaults or mutate production data; it only permits the next controlled activation dry-run phase.
