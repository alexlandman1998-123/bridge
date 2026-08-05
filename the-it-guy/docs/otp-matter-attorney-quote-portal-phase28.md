# OTP Generator Phase 28 Matter Attorney Quote Portal Flow

Generated: 2026-08-05T11:57:19.725Z
Version: otp_matter_attorney_quote_portal_phase28_v1
Contract: otp-vnext-matter-attorney-quote-portal-phase28-v1
Status: OTP_MATTER_ATTORNEY_QUOTE_PORTAL_READY_FOR_PHASE29_FINAL_PRODUCTION_READINESS_GATE
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| Service operations | 6 |
| Action proofs | 4 |
| Blockers | 0 |
| Next phase | Phase 29: Final Production Readiness Gate |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE28_PHASE27_GENERATED_PDF_PROOF_READY | yes | Matter attorney quote portal flow starts only after generated PDF proof is green. |
| PHASE28_PERSISTENCE_SUPPORTS_PORTAL_STATE | yes | Existing persistence supports transaction-scoped quote upload, buyer viewed/queried, revision and acknowledgement states. |
| PHASE28_SERVICE_WRAPPER_PRESENT | yes | Service wrapper exposes role-scoped portal operations and checks transaction assignment access before write actions. |
| PHASE28_RESALE_AND_DEVELOPMENT_ROUTES_SEPARATED | yes | Resale and new-development matter quote portal states are route-aware and transaction-scoped. |
| PHASE28_BUYER_QUERY_REVISION_ACK_FLOW_PROVED | yes | Buyer view/query/acknowledge and attorney upload/revision actions produce the expected transaction-matter statuses. |
| PHASE28_PUBLIC_ATTORNEY_LEAD_QUOTES_EXCLUDED | yes | Portal flow rejects attorney lead quote scope and does not call public attorney lead quote/email workflows. |

## Route Portal States

| Route | Status | Portal ready | Transaction scoped | Lead quote separated | Allowed actions |
| --- | --- | --- | --- | --- | --- |
| resale_existing_property | uploaded | yes | yes | yes | attorney_upload_quote, attorney_revise_quote, attorney_upload_final_statement, buyer_view_quote, buyer_query_quote, buyer_acknowledge_quote |
| new_development | pending_upload | yes | yes | yes | attorney_upload_quote, attorney_revise_quote, attorney_upload_final_statement |

## Action Proofs

| Action | Role | Next status | Document | Event | Allowed |
| --- | --- | --- | --- | --- | --- |
| buyer_query_quote | buyer | buyer_queried | buyer_transfer_cost_invoice | matter_attorney_quote_queried | yes |
| attorney_revise_quote | attorney | revised | buyer_transfer_cost_invoice | matter_attorney_quote_revised | yes |
| buyer_acknowledge_quote | buyer | acknowledged | buyer_transfer_cost_invoice | matter_attorney_quote_acknowledged | yes |
| attorney_upload_quote | attorney | uploaded | buyer_transfer_cost_invoice | matter_attorney_quote_uploaded | yes |

## Runtime Boundary

Phase 28 proves the transaction-scoped matter attorney quote portal flow only. It does not publish quote documents, send public attorney quote emails, mutate production templates, dispatch signing envelopes, or activate production defaults. Phase 29 is the final production readiness gate.
