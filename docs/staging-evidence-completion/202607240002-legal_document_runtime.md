# Staging Evidence Completion Packet

Version: `202607240002`
Stream: `legal_document_runtime`
Route: `apply_original`
File: `202607240002_global_mandate_platform_default_phase2.sql`
Evidence: `docs/staging-evidence/202607240002-legal_document_runtime.json`
Status: Pending

## Commands

```bash
node scripts/supabase-phase6-staging-execution.mjs --apply-sql --version 202607240002 --confirm APPLY_TO_STAGING_ONLY
```

```bash
node scripts/supabase-phase6-staging-execution.mjs --record-applied --version 202607240002 --evidence docs/staging-evidence/202607240002-legal_document_runtime.json --confirm APPLY_TO_STAGING_ONLY
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

- `staging_ledger_not_recorded`
- `catalog_checks_pending`
- `behavior_checks_pending`
- `rollback_or_no_residue_pending`
- `reviewer_pending`
- `approver_pending`
- `captured_at_pending`
