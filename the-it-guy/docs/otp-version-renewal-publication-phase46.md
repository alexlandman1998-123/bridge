# OTP Generator Phase 46 Version Renewal Publication Dry Run

Generated: 2026-08-05T15:43:34.554Z
Version: otp_version_renewal_publication_phase46_v1
Contract: otp-vnext-version-renewal-publication-phase46-v1
Status: OTP_VERSION_RENEWAL_PUBLICATION_DRY_RUN_READY_FOR_ACTIVATION_GUARD
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Passed dry-run receipts | 1 |
| Blocked dry-run receipts | 8 |
| Routes | 2 |
| Evidence items | 6 |
| Blockers | 0 |
| Next phase | Phase 47: Version Renewal Activation Guard |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE46_PHASE45_CHANGE_CONTROL_READY | yes | Version renewal publication dry-run starts only after Phase 45 change control is ready. |
| PHASE46_GOOD_DRY_RUN_PUBLICATION_READY | yes | A clean Phase 45 change-control receipt can complete a staged version renewal publication dry-run. |
| PHASE46_RESALE_AND_NEW_DEVELOPMENT_STAGED_SEPARATELY | yes | Resale and new-development route candidates must both be staged and remain route-specific. |
| PHASE46_DRY_RUN_DOES_NOT_MUTATE_LIVE_DEFAULTS | yes | The dry-run cannot mutate live defaults, production artifacts, signing dispatch, or live version records. |
| PHASE46_GENERATED_PROOF_AND_SCANNER_EVIDENCE_PRESENT | yes | Generated PDF proof, content scanner, signing alignment, route output, dry-run receipt, and rollback evidence must pass. |
| PHASE46_SIGNING_ENVELOPES_ALIGNED | yes | Route-specific signing envelopes must align with the Phase 45 proposed envelope keys. |
| PHASE46_PHASE45_BLOCKED_RECEIPT_REJECTED | yes | A blocked Phase 45 change-control receipt cannot enter publication dry-run. |
| PHASE46_MISSING_ROUTE_BLOCKED | yes | Missing resale or new-development route publication output blocks the dry-run. |
| PHASE46_DOCX_REGRESSION_BLOCKED | yes | DOC/DOCX source references are blocked from publication dry-run. |
| PHASE46_VERSION_COLLISION_BLOCKED | yes | Version collisions, mutable records, or live-published candidates block the dry-run. |
| PHASE46_LIVE_MUTATION_BLOCKED | yes | Production writes or live default mutation attempts are blocked during publication dry-run. |
| PHASE46_SIGNING_ENVELOPE_MISMATCH_BLOCKED | yes | A route signing envelope mismatch blocks publication dry-run. |
| PHASE46_MISSING_EVIDENCE_BLOCKED | yes | Missing generated proof or other dry-run evidence blocks publication dry-run. |
| PHASE46_ROLLBACK_SNAPSHOT_BLOCKED | yes | Rollback snapshot and restore commands must be ready before dry-run publication can pass. |
| PHASE46_PACKAGE_SCRIPTS_WIRED | yes | Package scripts expose the Phase 46 test and report. |

## Dry-Run Receipts

| Status | Allowed | Routes staged | Evidence | Live default mutations | Blockers |
| --- | --- | --- | --- | --- | --- |
| OTP_VERSION_RENEWAL_PUBLICATION_DRY_RUN_READY_FOR_ACTIVATION_GUARD | yes | 2 | 6 | 0 | none |
| OTP_VERSION_RENEWAL_PUBLICATION_DRY_RUN_BLOCKED | no | 2 | 6 | 0 | phase45_change_control_not_ready, phase45_change_control_cannot_prepare_renewal, phase45_change_control_has_blockers |
| OTP_VERSION_RENEWAL_PUBLICATION_DRY_RUN_BLOCKED | no | 1 | 6 | 0 | route_publication_missing:new_development |
| OTP_VERSION_RENEWAL_PUBLICATION_DRY_RUN_BLOCKED | no | 2 | 6 | 0 | route_publication_docx_source_observed:resale_existing_property |
| OTP_VERSION_RENEWAL_PUBLICATION_DRY_RUN_BLOCKED | no | 2 | 6 | 0 | version_record_not_immutable, version_collision_detected, candidate_published_to_live |
| OTP_VERSION_RENEWAL_PUBLICATION_DRY_RUN_BLOCKED | no | 2 | 6 | 1 | publication_mode_not_dry_run, publication_target_not_staging, publication_production_write_requested, publication_live_default_mutation_requested, publication_signing_dispatch_requested, mutation_proof_not_audit_only, mutation_proof_mutated_data, production_write_attempted, live_default_mutation_observed, production_artifact_mutation_observed, signing_dispatch_mutation_observed |
| OTP_VERSION_RENEWAL_PUBLICATION_DRY_RUN_BLOCKED | no | 2 | 6 | 0 | candidate_signing_envelope_mismatch:new_development, signing_envelope_not_passed:new_development |
| OTP_VERSION_RENEWAL_PUBLICATION_DRY_RUN_BLOCKED | no | 2 | 5 | 0 | missing_dry_run_evidence:generated_pdf_proof |
| OTP_VERSION_RENEWAL_PUBLICATION_DRY_RUN_BLOCKED | no | 2 | 6 | 0 | previous_defaults_snapshot_missing, previous_version_restore_not_ready |

## Boundary

Phase 46 proves an approved Phase 45 template renewal can be published only as a staged dry-run candidate: resale and new-development outputs stay separate, generated proof and scanner evidence pass, signing envelopes match the proposed route keys, version metadata remains immutable, rollback snapshots are ready, and live defaults or production artifacts are not mutated. The test/report path remains receipt-only and does not mutate production data.
