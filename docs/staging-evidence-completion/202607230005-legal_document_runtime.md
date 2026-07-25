# Staging Evidence Completion Packet

Version: `202607230005`
Stream: `legal_document_runtime`
Route: `apply_original`
File: `202607230005_phase6_successor_release_epoch_integrity.sql`
Evidence: `docs/staging-evidence/202607230005-legal_document_runtime.json`
Status: Complete

## Commands

```bash
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607230005 --confirm APPLY_TO_STAGING_ONLY
```

```bash
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607230005 --evidence docs/staging-evidence/202607230005-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY
```

## Required Evidence

- Real staging project ref in `targetProjectRef` and `stagingProjectRef`
- `sqlApplied: true`
- `stagingLedgerRecorded: true`
- `catalogChecks: "pass"`
- `behaviorChecks: "pass"`
- `rollbackOrNoResidue: "pass"`
- `reviewedBy`, `approvedBy`, and `capturedAt`


## Blockers

- None
