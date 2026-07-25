# Staging Evidence Completion Packet

Version: `202607220003`
Stream: `legal_document_runtime`
Route: `apply_original`
File: `202607220003_signable_packet_sent_phase1.sql`
Evidence: `docs/staging-evidence/202607220003-legal_document_runtime.json`
Status: Complete

## Commands

```bash
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607220003 --confirm APPLY_TO_STAGING_ONLY --phase1-receipt the-it-guy/config/legal-document-rollout-phase1-staging.json --phase1-receipt-digest sha256:08917a8cd139538cdf40f4f2eafd60acf351ba6efd6d0ea7c14fc21206581303
```

```bash
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607220003 --evidence docs/staging-evidence/202607220003-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY --phase1-receipt the-it-guy/config/legal-document-rollout-phase1-staging.json --phase1-receipt-digest sha256:08917a8cd139538cdf40f4f2eafd60acf351ba6efd6d0ea7c14fc21206581303
```

## Required Evidence

- Real staging project ref in `targetProjectRef` and `stagingProjectRef`
- `sqlApplied: true`
- `stagingLedgerRecorded: true`
- `catalogChecks: "pass"`
- `behaviorChecks: "pass"`
- `rollbackOrNoResidue: "pass"`
- `reviewedBy`, `approvedBy`, and `capturedAt`
- Phase 1 receipt digest, migration hash, predecessor ledger digest, and final ledger digest

## Blockers

- None
