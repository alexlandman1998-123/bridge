# Staging Evidence Completion Packet

Version: `202607250004`
Stream: `legal_document_runtime`
Route: `apply_original`
File: `202607250004_corrective_legal_runtime_metadata_immutability.sql`
Evidence: `docs/staging-evidence/202607250004-legal_document_runtime.json`
Status: Complete

## Commands

```bash
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607250004 --confirm APPLY_TO_STAGING_ONLY
```

```bash
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607250004 --evidence docs/staging-evidence/202607250004-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY
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
