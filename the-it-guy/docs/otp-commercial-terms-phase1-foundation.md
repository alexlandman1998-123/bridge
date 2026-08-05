# OTP Commercial Terms Phase 1 Foundation

Generated: 2026-08-05T11:02:41.197Z
Version: otp_commercial_terms_phase1_v1
Record contract: otp_commercial_terms_record_phase1_v1
Status: OTP_COMMERCIAL_TERMS_FOUNDATION_READY
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| Resale cost items | 4 |
| New-development cost items | 4 |
| Commission variation statuses | 4 |
| Matter attorney quote statuses | 7 |
| Blockers | 0 |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE1_COMMISSION_VARIATION_DOES_NOT_OVERWRITE_MANDATE | yes | Mandate commission remains a snapshot while OTP proposal is a separate approval record. |
| PHASE1_PENDING_COMMISSION_VARIATION_BLOCKS_LOCK | yes | Transaction commission lock is blocked until a negotiated OTP commission is approved or rejected. |
| PHASE1_APPROVED_COMMISSION_VARIATION_CAN_LOCK | yes | Approved OTP commission can become the transaction commission basis without mutating the mandate. |
| PHASE1_RESALE_COST_OBLIGATIONS_NOT_DEVELOPMENT_ONLY | yes | Seller onboarding rates, levies, HOA/body-corporate facts normalize into resale OTP buyer-cost records. |
| PHASE1_DEVELOPMENT_COST_OBLIGATIONS_STAY_ROUTE_SCOPED | yes | New-development cost records remain separate from resale seller-onboarding cost records. |
| PHASE1_MATTER_ATTORNEY_QUOTE_IS_TRANSACTION_SCOPED | yes | Attorney cost quote state requires transaction_id and transaction_attorney_assignment_id, not attorney lead quote scope. |
| PHASE1_MATTER_ATTORNEY_QUOTE_STATUSES_MATCH_FLOW | yes | Matter quote statuses support upload, buyer view/query, revision, acknowledgement and superseding. |

## Boundary

Phase 1 creates the canonical commercial-term contract for OTP commission variation, buyer/scheme cost obligations and matter-level attorney cost quote state. It does not send attorney quotes, mutate mandate commission, publish client portal documents, or change production route defaults.
