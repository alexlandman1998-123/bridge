# OTP Generator Phase 23 Reconciliation

Generated: 2026-08-05T11:08:34.913Z
Version: otp_generator_reconciliation_phase23_v1
Contract: otp-vnext-generator-reconciliation-phase23-v1
Status: OTP_GENERATOR_RECONCILIATION_READY_FOR_PHASE24_PERSISTENCE
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| Verified template phases | 23 |
| Commercial gaps classified | 4 |
| Remaining phases | 6 |
| Blockers | 0 |
| Next phase | Phase 24: Commercial Terms Persistence |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE23_TEMPLATE_STREAM_0_TO_22_VERIFIED | yes | OTP Template vNext Phases 0-22 are represented as verified before Phase 23 starts. |
| PHASE23_PHASE22_LIVE_WRITE_GUARD_READY | yes | The Phase 22 live-write guard remains ready and no production write is executed. |
| PHASE23_COMMERCIAL_GAP_FOUNDATION_READY | yes | Commercial gap foundation for commission variation, buyer costs and matter attorney quote state is ready. |
| PHASE23_ALL_KNOWN_GAPS_CLASSIFIED | yes | Known commercial gaps are classified and mapped into the remaining OTP generator phases. |
| PHASE23_RESALE_AND_NEW_DEVELOPMENT_ROUTES_REMAIN_PRIMARY | yes | The reconciliation keeps resale and new-development as separate primary OTP routes. |
| PHASE23_REMAINING_PHASES_LOCKED | yes | The remaining work is consolidated into Phases 24-29. |
| PHASE23_NEXT_PHASE_IS_PERSISTENCE | yes | Phase 24 is the next actionable phase: commercial terms persistence. |
| PHASE23_REMAINING_PHASES_HAVE_ENTRY_EXIT_CRITERIA | yes | Every remaining phase has explicit entry and exit criteria. |

## Completed Template Stream

| Phase | Key | Status | Label |
| --- | --- | --- | --- |
| 0 | lock_the_rules | verified | Lock The Rules |
| 1 | reference_extraction_shell_target | verified | Reference Extraction and Shell Target |
| 2 | route_split | verified | Resale and New-Development Route Split |
| 3 | field_registry | verified | Field Registry and Legal Wording Draft |
| 4 | resale_legal_content | verified | Resale Legal Content and Data Lock |
| 5 | new_development_legal_content | verified | New-Development Legal Content |
| 6 | branded_pdf_shell | verified | Branded PDF Shell and Legal Content Templates |
| 7 | structured_terms | verified | Structured Terms |
| 8 | signatures_initials | verified | Signatures and Initials |
| 9 | content_scanner | verified | Content Scanner |
| 10 | settings_admin_readiness | verified | Settings and Admin Readiness |
| 11 | runtime_integration | verified | Runtime Integration |
| 12 | staging_activation | verified | Staging Activation |
| 13 | staging_smoke_pdf_proof | verified | Staging Smoke / Generated PDF Proof |
| 14 | signing_envelope_qa | verified | Signing Envelope QA |
| 15 | signing_dispatch_dry_run | verified | Signing Dispatch Dry Run |
| 16 | signer_session_qa | verified | Signer Session QA |
| 17 | final_completion_dry_run | verified | Final Completion Dry Run |
| 18 | release_candidate_lock | verified | Release Candidate Lock |
| 19 | production_promotion_preflight | verified | Production Promotion Preflight |
| 20 | controlled_production_activation_dry_run | verified | Controlled Production Activation Dry Run |
| 21 | production_activation_receipt | verified | Production Activation Receipt |
| 22 | live_write_guard | verified | Live Write Guard |

## Commercial Gap Stream

| Gap | Status | Remaining Phase | Boundary |
| --- | --- | --- | --- |
| Mandate commission vs negotiated OTP commission | foundation_verified | 24 | Mandate commission is preserved as a snapshot; negotiated OTP commission requires approval before transaction commission lock. |
| Buyer cost obligations and scheme costs | foundation_verified | 24 | Resale and new-development cost obligations are route-scoped structured records, with known, estimated and pending states. |
| Matter-level attorney transfer-cost quote/status | foundation_verified | 24 | Transaction attorney quote state is scoped by transaction_id and transaction_attorney_assignment_id, separate from public attorney lead quotes. |
| Resale and new-development separation | foundation_verified | 26 | Commercial records must stay route-aware all the way through persistence, UI, runtime input and generated PDF proof. |

## Remaining Work

| Phase | Status | Purpose | Exit Criteria |
| --- | --- | --- | --- |
| Phase 24: Commercial Terms Persistence | next | Persist OTP commission variation approvals, buyer cost obligation items and matter attorney cost quote state. | SQL tables, constraints and RLS are additive and route-aware; Service functions can create/read/update commission variation, cost obligations and matter quote state; Attorney lead quotes remain excluded from transaction matter quote source of truth |
| Phase 25: OTP Review UI | planned | Expose commercial records before generation for agent/admin review and approval. | Negotiated commission approval status is visible before generation; Buyer cost obligations show known, estimated and pending states; Resale and new-development review screens stay separate |
| Phase 26: Runtime Data Wiring | planned | Connect seller onboarding, transaction offer terms, commission records, attorney assignment and cost obligations into generator input. | Seller rates, levies, HOA/body-corporate facts flow into resale OTP inputs; Development levy, rates and utility charges flow into new-development OTP inputs; Commission lock decision gates transaction commission finalisation |
| Phase 27: Generated PDF Proof | planned | Generate actual resale and new-development PDFs proving branding, legal wording, commercial fields, signatures and route separation. | Resale PDF renders commission variation and buyer cost schedule correctly; New-development PDF renders development costs without resale seller-onboarding leakage; Logo, company details, footer positions, page numbers, signatures and initials are visually proved |
| Phase 28: Matter Attorney Quote Portal Flow | planned | Wire attorney upload, buyer view/query, revision and acknowledgement for transaction-scoped transfer-cost quote/state. | Attorney can upload/revise quote or statement against the transaction assignment; Buyer can view, query and acknowledge only their matter quote; Public attorney lead quote workflow remains separate |
| Phase 29: Final Production Readiness Gate | planned | Run the full generated PDF, signing, completion, live-write guard and rollback/receipt evidence chain with commercial terms included. | Full OTP generator proof passes for both routes; Signing envelope/session/finalisation dry runs include commercial terms; Production activation remains blocked without valid receipt, operator confirmation and live-write guard match |

## Evidence

```json
{
  "liveWriteGuard": {
    "version": "otp_live_write_guard_phase22_v1",
    "status": "OTP_LIVE_WRITE_GUARD_READY_FOR_APPLY_COMMAND_REHEARSAL",
    "mutatedData": false,
    "blockerCount": 0
  },
  "commercialTerms": {
    "version": "otp_commercial_terms_phase1_v1",
    "status": "OTP_COMMERCIAL_TERMS_FOUNDATION_READY",
    "mutatedData": false,
    "blockerCount": 0
  }
}
```

## Boundary

Phase 23 reconciles the OTP generator roadmap. It does not create database persistence, alter production defaults, send signing envelopes, publish attorney quote documents, or mutate live data. Phase 24 is the next implementation phase.
