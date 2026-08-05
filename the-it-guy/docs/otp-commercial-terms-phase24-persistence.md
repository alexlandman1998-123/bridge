# OTP Generator Phase 24 Commercial Terms Persistence

Generated: 2026-08-05T11:14:09.541Z
Version: otp_commercial_terms_persistence_phase24_v1
Contract: otp-vnext-commercial-terms-persistence-phase24-v1
Status: OTP_COMMERCIAL_TERMS_PERSISTENCE_READY_FOR_PHASE25_REVIEW_UI
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Tables | 4 |
| RPCs | 3 |
| Service operations | 4 |
| Blockers | 0 |
| Next phase | Phase 25: OTP Review UI |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE24_PHASE23_RECONCILIATION_READY | yes | Phase 24 starts only after Phase 23 reconciles the template and commercial gap streams. |
| PHASE24_REQUIRED_TABLES_PRESENT | yes | Migration creates commission variation, cost obligation, matter attorney quote state and commercial event tables. |
| PHASE24_REQUIRED_RPCS_PRESENT | yes | Migration exposes service RPCs for commission variation, cost obligations and matter attorney quote state. |
| PHASE24_MANDATE_COMMISSION_PRESERVED | yes | Persistence preserves the mandate commission snapshot and does not mutate transaction_commissions. |
| PHASE24_ROUTE_SCOPING_ENFORCED | yes | Commission, cost and matter quote records are constrained to resale or new-development routes. |
| PHASE24_COST_OBLIGATION_MODEL_PERSISTED | yes | Buyer cost obligations persist amount status, OTP inclusion and active route item uniqueness. |
| PHASE24_MATTER_ATTORNEY_QUOTE_SEPARATED_FROM_LEAD_QUOTES | yes | Matter attorney quote state requires a transaction attorney assignment and excludes attorney lead quote tables. |
| PHASE24_RLS_ENABLED | yes | All new persistence tables enable RLS. |
| PHASE24_READINESS_VIEW_PRESENT | yes | Persistence readiness view summarizes pending approval, visible costs and matter quote state. |
| PHASE24_SERVICE_WRAPPER_PRESENT | yes | Frontend service wrapper exposes all Phase 24 persistence operations and calls the correct RPCs. |
| PHASE24_AUDIT_EVENTS_RECORDED | yes | Commercial persistence records audit events for commission, cost and matter quote changes. |

## Tables

| Table |
| --- |
| otp_commission_variations |
| otp_cost_obligation_items |
| matter_attorney_cost_quote_states |
| otp_commercial_term_events |

## RPCs

| RPC |
| --- |
| bridge_record_otp_commission_variation |
| bridge_upsert_otp_cost_obligation_item |
| bridge_upsert_matter_attorney_cost_quote_state |

## Service Operations

| Operation |
| --- |
| recordOtpCommissionVariation |
| upsertOtpCostObligationItem |
| upsertMatterAttorneyCostQuoteState |
| listOtpCommercialTermsPersistenceReadiness |

## Boundary

Phase 24 adds additive persistence and service wrappers only. It does not build the review UI, render generated PDFs, publish buyer portal quote documents, or activate production defaults. Phase 25 is the next implementation phase.
