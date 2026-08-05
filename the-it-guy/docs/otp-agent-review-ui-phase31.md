# OTP Generator Phase 31 Agent OTP Review UI Wiring

Generated: 2026-08-05T13:09:07.763Z
Version: otp_agent_review_ui_phase31_v1
Contract: otp-vnext-agent-review-ui-phase31-v1
Status: OTP_AGENT_REVIEW_UI_READY_FOR_RUNTIME_PROOF
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Review sections | 8 |
| Standard condition controls | 4 |
| Blockers | 0 |
| Next phase | Phase 32: OTP Agent Review Runtime Generation Proof |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE31_PHASE30_CONTROLS_READY | yes | The review UI starts from the Phase 30 controlled-edit contract. |
| PHASE31_GENERATE_GATED_BY_REVIEW | yes | The OTP Generate button is gated until the agent confirms reviewed transaction terms. |
| PHASE31_CONFIRMED_REVIEW_CAN_GENERATE | yes | A matching review record unlocks generation without raw template mutation. |
| PHASE31_WORKSPACE_PANEL_WIRED | yes | The legal document workspace includes the OTP review panel, open action and persisted review record. |
| PHASE31_GENERATION_PAYLOAD_WIRED | yes | Generation receives the reviewed OTP record after the review is confirmed. |
| PHASE31_PACKAGE_SCRIPTS_WIRED | yes | Package scripts expose the Phase 31 test and report. |

## Boundary

Phase 31 wires the agent review UI and generation gate. It records reviewed transaction terms only; it does not edit legal clauses, signing maps, route defaults, or production template records.
