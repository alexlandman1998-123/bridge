# OTP Generator Phase 25 Review UI

Generated: 2026-08-05T11:21:56.314Z
Version: otp_commercial_terms_review_phase25_v1
Contract: otp-vnext-commercial-terms-review-phase25-v1
Status: OTP_COMMERCIAL_TERMS_REVIEW_READY_FOR_PHASE26_RUNTIME_WIRING
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| OTP routes | 2 |
| Review routes | 2 |
| Blockers | 0 |
| Resale sample warnings | 3 |
| New-development sample warnings | 2 |
| Next phase | Phase 26: Runtime Data Wiring |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE25_PHASE24_PERSISTENCE_READY | yes | Phase 25 starts only after commercial terms persistence is verified. |
| PHASE25_COMMISSION_APPROVAL_VISIBLE_AND_BLOCKING | yes | Negotiated commission approval status is visible before generation and blocks until approval. |
| PHASE25_MANDATE_COMMISSION_REMAINS_SEPARATE | yes | The review shows mandate and OTP commission separately instead of overwriting the mandate commission. |
| PHASE25_COST_OBLIGATION_STATUSES_VISIBLE | yes | Buyer cost obligations are grouped into known, estimated, pending and not-applicable states for review. |
| PHASE25_RESALE_AND_DEVELOPMENT_REVIEW_SCREENS_SEPARATE | yes | Resale and new-development review models use separate screen keys and prevent cross-route cost leakage. |
| PHASE25_MATTER_ATTORNEY_QUOTE_TRANSACTION_SCOPED | yes | Matter attorney quote review is scoped to transaction attorney assignment and excludes lead quote scope. |
| PHASE25_REVIEW_PANEL_COMPONENT_PRESENT | yes | A reusable OTP commercial terms review panel can render route, commission, costs and matter quote sections. |

## Review Routes

| Route | Screen | Expected cost keys | Prohibited cost keys |
| --- | --- | --- | --- |
| resale_existing_property | otp_review_resale_existing_property | buyer_transfer_cost_quote, buyer_transfer_duty, municipal_rates_estimate, scheme_levy_estimate | development_levy_estimate, utility_connection_charges |
| new_development | otp_review_new_development | buyer_transfer_cost_quote, buyer_transfer_duty, development_levy_estimate, utility_connection_charges | municipal_rates_estimate, scheme_levy_estimate |

## Runtime Boundary

Phase 25 builds the pre-generation review model and reusable UI panel only. It does not wire live runtime generation inputs, mutate commission records, dispatch signing envelopes, publish attorney quote documents, or activate production defaults. Phase 26 is the runtime data wiring phase.
