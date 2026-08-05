# OTP Generator Phase 26 Runtime Data Wiring

Generated: 2026-08-05T11:29:37.361Z
Version: otp_commercial_terms_runtime_phase26_v1
Contract: otp-vnext-commercial-terms-runtime-phase26-v1
Status: OTP_COMMERCIAL_TERMS_RUNTIME_READY_FOR_PHASE27_GENERATED_PDF_PROOF
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| OTP routes | 2 |
| Service operations | 2 |
| Blockers | 0 |
| Resale can generate | yes |
| New-development can generate | yes |
| Next phase | Phase 27: Generated PDF Proof |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE26_PHASE25_REVIEW_READY | yes | Phase 26 starts only after the pre-generation commercial review model is verified. |
| PHASE26_RESALE_SELLER_FACTS_FLOW_TO_GENERATOR_INPUT | yes | Seller rates, levies and scheme facts flow into resale OTP commercial generator input. |
| PHASE26_DEVELOPMENT_COSTS_FLOW_TO_GENERATOR_INPUT | yes | Development levy and utility charges flow into new-development OTP input without resale seller-cost leakage. |
| PHASE26_COMMISSION_LOCK_DECISION_GATES_FINALISATION | yes | Commission finalisation is allowed only when the OTP commission variation review is approved or not required. |
| PHASE26_MATTER_ATTORNEY_ASSIGNMENT_QUOTE_WIRED | yes | Matter attorney quote status is wired from transaction assignment scope, with attorney lead quotes excluded. |
| PHASE26_RUNTIME_SERVICE_PRESENT | yes | Service wrapper can load transaction, seller onboarding, commercial persistence and attorney assignment records. |

## Runtime Boundary

Phase 26 wires runtime records into the OTP commercial review and generator input shape. It does not generate or visually inspect PDFs, mutate transaction commission, publish attorney quote documents, send signing envelopes, or activate production defaults. Phase 27 is the generated PDF proof phase.
