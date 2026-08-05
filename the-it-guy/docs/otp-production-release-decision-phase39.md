# OTP Generator Phase 39 Production Release Decision / Cutover Checklist

Generated: 2026-08-05T14:21:27.101Z
Version: otp_production_release_decision_phase39_v1
Contract: otp-vnext-production-release-decision-phase39-v1
Status: OTP_PRODUCTION_RELEASE_DECISION_READY_FOR_MANUAL_SIGNOFF
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Approved cutover packs | 1 |
| Conditional legal-hold packs | 1 |
| Unsafe packs blocked | 3 |
| Blockers | 0 |
| Next phase | Phase 40: Controlled Production Cutover Execution |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE39_PHASE38_STAGING_WALKTHROUGH_READY | yes | Production release decision starts only after the Phase 38 end-to-end staging walkthrough is ready. |
| PHASE39_RELEASE_FLAGS_DEFINED | yes | The production release pack defines all required feature flags and rollback states. |
| PHASE39_ROLLBACK_PLAN_READY | yes | Rollback has explicit ready steps for disabling flags, restoring defaults, stopping dispatch and recording reversal. |
| PHASE39_TEMPLATE_DEFAULTS_LOCKED_PER_ROUTE | yes | Resale and new-development template defaults are present and separate. |
| PHASE39_NO_DOCX_TEMPLATE_DEFAULTS | yes | Production defaults are locked to native/PDF template sources rather than retired DOC/DOCX references. |
| PHASE39_ROUTE_AND_ENVELOPE_SEPARATION_LOCKED | yes | Resale and new-development routes keep separate template defaults and signing envelope keys. |
| PHASE39_EVIDENCE_LINKS_COMPLETE | yes | The release pack links the Phase 31 to Phase 38 evidence chain. |
| PHASE39_ATTORNEY_APPROVAL_PENDING_MARKED | yes | Legal content that still needs attorney approval is clearly marked and blocks production cutover. |
| PHASE39_APPROVED_PACK_CAN_CUTOVER_WITH_OPERATOR_REFERENCE | yes | A fully approved pack can move to controlled cutover only with operator approval reference present. |
| PHASE39_INCOMPLETE_ROLLBACK_BLOCKED | yes | A release pack with incomplete rollback readiness is blocked. |
| PHASE39_TEMPLATE_DEFAULT_COLLISION_BLOCKED | yes | A release pack that points both routes at one template default is blocked. |
| PHASE39_DOCX_SOURCE_BLOCKED | yes | A release pack that reintroduces a DOC/DOCX template source is blocked. |
| PHASE39_PACKAGE_SCRIPTS_WIRED | yes | Package scripts expose the Phase 39 test and report. |

## Decision Packs

| Decision | Can Cutover | Flags | Rollback | Evidence | Legal Holds | Blockers |
| --- | --- | --- | --- | --- | --- | --- |
| go_for_controlled_cutover | yes | 4 | 5 | 8 | none | none |
| conditional_go_pending_attorney_approval | no | 4 | 5 | 8 | attorney_approval_required:resale_existing_property, attorney_approval_required:new_development | none |
| no_go_remediation_required | no | 4 | 5 | 8 | none | rollback_step_not_ready:restore_previous_resale_default |
| no_go_remediation_required | no | 4 | 5 | 8 | none | template_default_collision:shared-template-id |
| no_go_remediation_required | no | 4 | 5 | 8 | none | docx_template_source_not_allowed:resale_existing_property |

## Template Defaults

| Route | Template Default | Previous Default | Source | Status |
| --- | --- | --- | --- | --- |
| resale_existing_property | otp-resale-template-vnext-phase39 | otp-resale-template-current | native_pdf_template | locked |
| new_development | otp-new-development-template-vnext-phase39 | otp-new-development-template-current | native_pdf_template | locked |

## Attorney Approval

| Route | Status | Reference | Note |
| --- | --- | --- | --- |
| resale_existing_property | pending_attorney_approval | pending | Attorney approval is still required before live cutover. |
| new_development | pending_attorney_approval | pending | Attorney approval is still required before live cutover. |

## Boundary

Phase 39 creates the production release decision and cutover checklist. It does not execute the production cutover. If attorney approval is pending, the pack may be technically complete but must remain a conditional go and cannot cut over.
